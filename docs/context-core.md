# 上下文核心模型设计

最后更新：2026-05-14

---



## 设计背景

March 的核心卖点是"上下文不会腐烂"。传统 Agent 把对话历史线性累积——读到旧版本文件、忘记前面做了什么、上下文膨胀后丢失关键信息。March 的做法是**每次 model call 前都从当前事实组装上下文**：把上下文拆成不同稳定性的层，越往下，层的变化概率越大，因为需要解决 token 缓存的成本问题。


## 系统结构

稳定层在上（一次注入、长期有效），高频层在下（每次 context assembly 刷新、按需注入）。排序的第一原则是 provider prefix cache：高频变化的小层不能放在大块内容前面，否则会让后面的大块 token 缓存失效。

```
层名                 | 稳定性        | 写入方                 | 读取方 | 职责
[system_core]        ← 几乎不变     | 写入：系统初始化       | AI 只读 | March base prompt、角色定义、安全约束、模型专属系统提示
[injections]         ← session 级   | 写入：MCP/扩展启动时   | AI 只读 | 外部系统明确要求注入给模型看的指令
[tools]              ← session 级   | 写入：系统初始化       | AI 只读 | 工具定义（name/schema/description）
[session_identity]   ← session 级   | 写入：March 运行时     | AI 只读 | cwd、workspace root、平台、shell
[available_skills]   ← session 级   | 写入：March 运行时     | AI 只读 | 可用技能目录摘要，提示何时需要激活
[active_skills]      ← 按需变化     | 写入：AI 工具调用       | 读写   | 已激活技能正文，AI 通过 activate/deactivate 开关
[open_files]         ← 调用前刷新   | 写入：AI 工具调用       | 读写   | 文件内容带绝对路径+行号，watcher 实时刷新
[diagnostics]        ← 调用前刷新   | 写入：March 运行时     | AI 只读 | LSP/编译器/linter 输出，按文件+行列归一化
[workspace_status]   ← 调用前刷新   | 写入：March 运行时     | AI 只读 | 目录结构摘要、git 状态、最近工作区变化
[runtime_status]     ← 调用前刷新   | 写入：March 运行时     | AI 只读 | 当前时间、锁定文件、上下文压力指标
[shells]             ← 调用前刷新   | 写入：March + AI 工具   | AI 只读 | 交互式 shell 纯文本摘要（最近 200 行，剥离 ANSI）
[recent_chat]        ← turn/model call 级追加 | 写入：March 运行时 | AI 只读 | 最近 10 个 turn + 每条消息后附加的 recall hints
```

**排序原因**：稳定前缀更容易命中 provider prefix cache；大块且相对稳定的内容尽量放在高频小层之前。`open_files` 可能很大，不能被 diagnostics、workspace/git 状态或记忆召回结果污染缓存。记忆召回结果不作为独立层注入，而是跟随消息附加在尾部的 [recent_chat] 中。

## 组件详述

### system_core

- **稳定性**：几乎不变
- **写入方**：系统初始化（模型 base prompt、March 角色定义）
- **读取方**：AI 模型（只读）
- **职责**：定义 March 的基本行为和身份——遵循什么规则、有什么能力边界
- **内容**：March 核心行为指令、安全约束、按 `modelId` 选择的 model-specific system prompt 文件
- **边界**：`provider`、`model`、`thinking` 是请求元数据，不默认写进上下文文本。`modelId` 只用于 March 内部选择模型专属系统提示；`provider` 只负责请求路由、鉴权和 transport；`thinking` 只作为 provider request option 传递

### injections

- **稳定性**：session 级（session 启动时确定，不再变）
- **写入方**：MCP server 连接时、扩展加载时
- **读取方**：AI 模型（只读）
- **职责**：外部系统通过标准协议注入的额外指令，且这些指令必须是明确要给模型阅读的文本
- **内容**：MCP server instructions、外部扩展注入的 policy / behavior snippets
- **边界**：MCP tools 仍进入 `[tools]`；MCP resources 不自动进入上下文；`provider`、`model`、`thinking` 不进入该层

### tools

- **稳定性**：session 级（session 启动时注入 1 次）
- **写入方**：系统初始化
- **读取方**：AI 模型（只读）
- **职责**：定义 AI 可调用的所有工具
- **内容**：每个工具的 name、简略 description、参数摘要；完整调用 schema 留在 runtime tool registry
- **边界**：`[tools]` 是能力说明，不承诺每次调用一定成功；MCP 断线、权限拒绝、外部服务失败等在实际工具调用结果中反馈，不让该层频繁变化

### session_identity

- **稳定性**：session 级（session 启动后不变）
- **写入方**：March 运行时
- **读取方**：AI 模型（只读）
- **职责**：告诉 AI "你在哪里、环境是什么"
- **内容**：当前工作目录、workspace 根路径、操作系统、平台、shell 类型
- **边界**：不包含目录结构、git 状态、最近变更文件；这些属于高频变化的 [workspace_status]

### available_skills

- **稳定性**：session 级（session 启动时扫描技能目录；除非技能文件被安装、删除或刷新，否则不变）
- **写入方**：March 运行时（扫描全局和项目技能目录）
- **读取方**：AI 模型（只读）
- **职责**：让 AI 知道有哪些技能可用，以及什么情况下应该激活它们；这是技能系统的目录层，不承载完整技能正文
- **内容**：技能名称、简短描述、触发条件
- **边界**：只放足够路由的信息，不放长指令、不放示例全集；真正改变 AI 行为的完整指令进入 [active_skills]

### active_skills

- **稳定性**：按需变化（AI 通过工具开关）
- **写入方**：AI 工具调用（activate_skill / deactivate_skill）
- **读取方**：AI 模型（读写）
- **职责**：让 AI 在当前任务需要时加载完整技能指令，不把所有技能正文一次性塞进上下文
- **内容**：当前已激活技能的名称、`baseDir`、完整行为指令和必要资源引用
- **边界**：只保留当前任务真正需要的技能；任务结束或不再相关时可以 deactivate，避免长期污染后续推理和浪费上下文

### open_files

- **稳定性**：调用前刷新（AI 可在一个 turn 内多次打开/关闭文件；每次 context assembly 前重新读取当前内容）
- **写入方**：AI 工具调用（open_file / close_file）
- **读取方**：AI 模型（读写）
- **职责**：让 AI 看到当前工作文件的完整内容——不是历史读取记录，而是当前磁盘事实
- **内容**：每个文件带绝对路径 + 行号格式化内容 + 行数 + pinned 状态。内容由 watcher 实时刷新

### diagnostics

- **稳定性**：调用前刷新（文件保存、语言服务器重新分析、typecheck/lint 命令完成后都会变化）
- **写入方**：March 运行时（LSP client、编译器 watcher、lint/typecheck runner）
- **读取方**：AI 模型（只读）
- **职责**：让 AI 看到"当前代码哪里不通过"的结构化事实，类似 VS Code 下方 Problems 面板，而不是让 AI 从 shell 输出里反复猜测错误位置
- **内容**：每条 diagnostic 包含 source、severity、绝对路径、起止行列、message、code、related information；按 open files 优先，其次按 severity 和最近变更文件排序，限制总量并保留 workspace error count
- **来源**：
  - LSP：March 启动对应语言服务器，监听 `textDocument/publishDiagnostics`，得到和 VS Code 基本同源的错误、警告和提示
- **接入原则**：
  - 优先接 LSP，因为它是增量的、低延迟的、天然按文件定位；这是 VS Code 错误提示的主要原理

### workspace_status

- **稳定性**：调用前刷新（文件增删、目录变化、git 状态变化后都会变化）
- **写入方**：March 运行时
- **读取方**：AI 模型（只读）
- **职责**：告诉 AI "当前工作区长什么样、哪些文件处在变更中"，但不承载具体文件正文
- **内容**：目录结构摘要、git 仓库状态、最近变更文件摘要
- **边界**：只放短摘要，不放 diff、不放完整文件内容。目录树用于导航，git 状态用于避免误判用户改动；具体文件内容仍由 [open_files] 或工具读取提供。该层高频变化，必须放在 [open_files] 后面，避免目录树/git 状态变化导致打开文件缓存失效

### runtime_status

- **稳定性**：调用前刷新
- **写入方**：March 运行时
- **读取方**：AI 模型（只读）
- **职责**：告诉 AI "当前时刻发生了什么"
- **内容**：当前时间、pinned 文件列表、上下文压力指标（token 使用率 / open files 数 / turn 数）、锁定文件提示

### shells

- **稳定性**：调用前刷新（shell 输出随每次命令执行变化——每次发上下文给模型时都可能不同）
- **写入方**：March 运行时（从 PTY runtime 读取摘要）+ AI 工具调用（shell_spawn / shell_send / shell_kill）
- **读取方**：AI 模型（只读）
- **职责**：让 AI 知道当前打开了哪些 shell 以及它们的输出——不需要完整 ANSI，只需要纯文本摘要
- **内容**：每个 shell 的 id、name、status、最近 200 行纯文本输出（ANSI 已剥离）
- **与其他组件的关系**：数据来自 [shell-runtime](../architecture/shell-runtime.md) 的 context/[shells] 层；被 SystemPrompt.environment() 消费注入 system prompt；shell_snapshot 工具可获取 screen buffer 级别的完整视图


### recent_chat

- **稳定性**：turn/model call 级追加（用户消息、assistant model output 后都可能追加 recall hints）
- **写入方**：March 运行时（turn 结束时生成摘要；每条消息后执行被动召回）
- **读取方**：AI 模型（只读）
- **职责**：最近对话的压缩视图；同时承载由对话激发的记忆线索，不注入记忆原文
- **内容**：最近 10 个用户 turn；每个 turn 含 [用户消息]、用户消息后的 recall hints、[turn 摘要]、[March 回复]，以及 assistant model output 后的 recall hints
- **被动召回**：用户消息后附加最多 3 条 recall hints；assistant 每次 model output 后附加最多 2 条 recall hints
- **召回格式**：每条 hint 只包含 `id`、`name`、`short_description`。AI 需要记忆原文时，必须通过主动 memory 工具打开
- **去重规则**：用户消息触发的 recall 使用与 recent_chat 对齐的滚动抑制窗口，默认覆盖最近 10 个用户 turn；assistant 输出触发的 recall 只在当前 turn 内去重；同时维护 turn 级 seen set，避免同一 turn 内 user recall 和 assistant recall 重复附加同一条记忆
- **主动回忆**：被动召回只提供线索；AI 可以通过 memory search/open/read 工具主动检索和读取记忆原文

## 关键流程

### 流程：每次模型调用前的上下文组装

1. [system_core] + [injections] + [tools] — 稳定层，session 启动时注入，后续 model call 不变
2. [session_identity] — March 写入稳定环境身份
3. [available_skills] — 注入可用技能目录摘要，供 AI 判断是否需要激活技能
4. [active_skills] — 读取当前激活的技能，注入完整技能内容
5. [open_files] — 调用 refresh() 重新读取磁盘文件（用户可能在终端里手动改了）
6. [diagnostics] — 读取当前 LSP/编译器/linter 诊断状态，注入相关错误摘要
7. [workspace_status] — March 写入目录结构摘要、git 状态和最近工作区变化
8. [runtime_status] — March 写入当前时间和压力指标
9. [shells] — 从 PTY runtime 读取当前 shell 输出摘要
10. [recent_chat] — 注入最近 10 个 turn 摘要，以及已附加在消息后的 recall hints
11. 组装完成 → 发给 AI

### 流程：被动记忆召回

1. 用户消息进入 turn 时，March 用用户消息检索 memory store，选出最多 3 条未被滚动抑制窗口过滤的 recall hints，附加在该用户消息后
2. 每次 assistant model output 结束后，March 用 assistant 输出检索 memory store，选出最多 2 条当前 turn 内未出现过的 recall hints，附加在该 assistant 输出后
3. 每条 recall hint 只包含 `id`、`name`、`short_description`，不包含记忆原文
4. 同一 turn 内维护 turn-level seen set，避免 user recall 和 assistant recall 重复附加同一条记忆
5. 用户消息召回另有 rolling suppression window，默认覆盖最近 10 个用户 turn，避免同一段连续对话里反复提示同一条记忆
6. AI 如果需要读取记忆原文，必须调用主动 memory 工具

### 流程：文件被外部修改

1. 用户在终端里手动改了 `src/auth.ts`
2. 下一次 context assembly 时，[open_files] 的 refresh() 检测内容变更
3. 新内容替换旧内容，行号重新计算
4. [diagnostics] 中该文件旧版本诊断被标记 stale，等待 LSP 或 checker 刷新
5. AI 看到的是最新版本，并能区分"当前错误"和"可能过期的错误"——不会出现"基于旧行号编辑造成冲突"的问题

### 流程：编译器产生错误

1. 用户或 AI 修改 `packages/opencode/src/auth.ts`
2. March 的 LSP client 收到 TypeScript server 推送的 diagnostics，或 typecheck runner 完成一次 `bun typecheck`
3. March 将原始错误归一化为 `{ source, severity, path, range, message, code }`
4. 下一次 context assembly 时，[diagnostics] 注入当前 open files 相关错误和 workspace 摘要
5. AI 修复代码后，diagnostics 随 LSP/checker 下一轮结果刷新；如果错误消失，该条 diagnostic 从上下文中移除
