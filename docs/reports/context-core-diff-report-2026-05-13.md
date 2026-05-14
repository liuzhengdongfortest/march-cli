# context-core.md 差异分析报告（2026-05-13）

当前代码实现仍是较轻量的上下文重建引擎，尚未跟上文档的目标层次。2026-05-14 已先收敛 `[system_core]` / request metadata 边界：`provider`、`model`、`thinking` 不再写入 prompt context，`modelId` 只用于内部选择 model-specific system prompt，`thinking` 只作为 provider request option。剩余最大差异有四类：

- 文档有 `[workspace_status]`，实际没有独立层；目录树仍在 `[session_status]` 中生成。
- 文档把 `[tools]` 放在稳定前缀，实际 `[tools]` 在 `[open_files]` 后面按 active tool names 注入。
- 文档有 `[diagnostics]` 目标层，实际没有代码诊断上下文层。
- 文档描述了 watcher、逐行行号、最近 10 个 turn、最近 200 行 shell 输出等能力，实际实现分别是在 context assembly 时同步读文件、正文无逐行行号、最多 20 个 turn、shell 输出按 2000 字符截断。

## 文档目标顺序与实际顺序

`docs/context-core.md` 当前目标顺序：

```text
[system_core]
[injections]
[tools]
[session_status]
[available_skills]
[active_skills]
[open_files]
[diagnostics]
[memory]
[workspace_status]
[runtime_status]
[shells]
[recent_chat]
```

当前 `ContextEngine.buildContext()` 的实际顺序：

```text
[system_core]
[session_status]
[memory]?              # graph 存在且 buildMemoryLayer 有返回内容时
[available_skills]?    # skillPool 非空时
[active_skills]?       # active skills 非空时
[open_files]?          # open files 非空时
[tools]?               # toolDefs 非空时
[runtime_status]
[shells]?              # shellRuntime 有 shell 时
[recent_chat]
```

代码依据：`src/context/engine.mjs:31-71`。

关键差异：

- `[tools]`：文档在稳定前缀，实际在 `[open_files]` 后。
- `[injections]`：文档有目标层，实际当前没有输出；`provider/model/thinking` 已从该层移除。
- `[memory]`：文档在 `[diagnostics]` 后，实际在 `[session_status]` 后、技能层前。
- `[diagnostics]`：文档有，实际无。
- `[workspace_status]`：文档有，实际无。
- `[session_status]`：文档只保留环境身份，实际仍包含目录树。
- `[available_skills]`：文档和实际都存在，但实际仅在 skillPool 非空时出现。
- `[active_skills]`：文档和实际都存在，但实际仅在 active skills 非空时出现。

## 各层差异分析

### system_core

文档描述：内容来自模型特定 base prompt，例如 `gpt.txt` / `anthropic.txt`，并包含 March 核心行为指令、安全约束。

实际实现：`src/context/system-core.mjs` 中构建稳定 `[system_core]`，按 `modelId` 从 prompt 文件夹选择 model-specific system prompt，找不到则使用 `default.md`。`provider` 不参与 prompt 选择；`ContextEngine` 会缓存 system core，并在 prompt key 变化时重建。

影响：已具备最小可扩展 prompt 架构。若要支持更复杂的模型差异，新增对应 `modelId.md` 即可。

### injections

文档描述：来自 MCP server 和扩展启动时注入的指令，包含 MCP 工具列表、外部扩展注入的指令段。

实际实现：当前没有 `[injections]` 文本层输出。早期实现曾在这里注入 `provider`、`model`、`thinking`，但这些已经被明确归类为 request metadata / runtime internal state，不再污染 prompt context。

影响：当前 MCP、web、memory、skill 等能力主要通过工具注册进入 session，不是作为 `[injections]` 文本层注入。文档中的 injections 仍偏目标架构，但边界已明确：只承载外部明确要求给模型看的指令。

### tools

文档描述：session 级稳定层，启动时注入工具定义，位于 `[session_status]` 前。

实际实现：`src/agent/runner-session-state.mjs:13-30` 从 active pi session 读取 active tool names 和 tool definitions，再通过 `engine.setToolDefs()` 同步；`src/context/engine.mjs:61-63` 在 `[open_files]` 后才注入 `[tools]`。

影响：如果 active tools 在 session 中稳定，放在后面会降低 provider prefix cache 命中率。如果 active tools 会随 runtime host、权限、summary 阶段变化，则文档需要把它标为“session 内可能变化”，而不是完全稳定层。

### session_status

文档描述：session 级环境身份，只包含 cwd、workspace root、操作系统、platform、shell 类型。

实际实现：`src/context/session-status.mjs:42-65` 包含 `cwd`、`platform`、shell 信息、`project`，并生成 `Directory tree (top 3 levels)`。

影响：文档已经把目录结构移到 `[workspace_status]`，但实现还没有拆。当前 `[session_status]` 仍会随目录增删变化，不满足 session 级稳定层的缓存假设。

### available_skills

文档描述：session 级技能目录摘要，只放技能名称、简短描述、触发条件、来源位置摘要；用于判断何时激活技能。

实际实现：`src/context/skill-layers.mjs:1-16` 输出 `[available_skills]`，包含 `<available_skills>` XML 风格块、技能 name 和 description，并提示使用 `activate_skill` 加载完整指令。

影响：文档和实现基本一致。差异是实现不输出来源位置摘要，也没有显式触发条件字段；触发条件目前折叠在 description 中。

### active_skills

文档描述：按需变化，AI 通过 `activate_skill` / `deactivate_skill` 开关，注入已激活技能正文和必要资源引用。

实际实现：`src/skills/tools.mjs:27-65` 提供 `activate_skill` / `deactivate_skill` 工具并调用 `engine.setSkills()`；`src/context/skill-layers.mjs:18-32` 输出技能正文，包含 `<skill_content name="...">`，以及可选 `Skill directory` 和相对路径说明。

影响：文档和实现大体一致。需要注意的是实际 active skill 不会自动按任务结束 deactivate，长期会话中仍依赖 AI 或用户显式移除。

### open_files

文档描述：调用前刷新，内容由 watcher 实时刷新；每个文件带绝对路径、逐行行号、行数、pinned 状态。

实际实现：`src/context/engine.mjs:31-32` 在每次 `buildContext()` 开头调用 `#refreshOpenFiles()`；`src/context/engine.mjs:289-299` 同步 `readFileSync()` 重读 open files；`src/context/engine.mjs:221-230` 输出 header `--- path (1-N) ---` 和文件正文。

影响：当前实现能在 buildContext 前刷新磁盘事实，但不是 watcher 实时刷新。正文没有逐行行号，只有 header 的 `1-N` 范围；这会影响模型基于行号编辑时的定位质量。文件删除时会设置 `entry.stale = true`，但上下文输出没有展示 stale 标记。

### diagnostics

文档描述：LSP、编译器、linter 输出的结构化代码诊断层，包含 source、severity、path、range、message、code、related information，并支持 stale diagnostics。

实际实现：没有 `[diagnostics]` 上下文层。代码中存在 extension、keybindings、prompt templates、memory graph 等“diagnostics”概念，但它们不是代码诊断上下文层，也没有发现 LSP client 或 `textDocument/publishDiagnostics` 接入。

影响：这是当前目标架构和实现之间最大的功能缺口之一。文档中的“AI 看到当前代码哪里不通过”当前不成立。

### memory

文档描述：跨 session 的 4 实体图记忆系统，写入方为 AI 工具调用，读写属性为读写。

实际实现：`src/context/memory-layer.mjs:3-60` 是选择性披露策略。首轮尝试注入 root children 中的 boot memory；用户消息命中 glossary 时注入匹配 memory，匹配内容超过 800 字符会截断；还会尝试注入 `session://current/...`。若没有 entries，则不输出 `[memory]` 层。

影响：文档描述了存储模型，但对“上下文披露策略”仍过于简略。实际 memory 不是每次完整注入，而是按 boot、keyword、session current 选择性披露。

### workspace_status

文档描述：调用前刷新，包含目录结构摘要、git 仓库状态、最近变更文件摘要；只放短摘要，不放 diff、不放完整文件内容。

实际实现：没有 `src/context/workspace-status.mjs`，也没有 `[workspace_status]` 输出。目录树仍由 `src/context/session-status.mjs:5-40` 构建并注入 `[session_status]`；当前未发现 git status 注入。

影响：文档层边界已经正确，但实现未迁移。当前目录树仍污染 session 级稳定前缀；git 状态和最近变更文件并不会自动进入上下文。

### runtime_status

文档描述：当前时间、pinned 文件列表、上下文压力指标、锁定文件提示。

实际实现：`src/context/runtime-status.mjs:1-24` 输出 `time`、`turn`、`context_pressure`、可选 `session_name`、`open_files`、可选 `pinned_files`。压力值只根据 turn 数计算：大于 15 为 high，大于 8 为 moderate，否则 low。

影响：文档和实现基本一致，但“token 使用率”尚未真实参与计算；“锁定文件提示”实际是 pinned files，没有独立 lock 机制。

### shells

文档描述：每个 shell 注入 id、name、status、最近 200 行纯文本输出，ANSI 已剥离。

实际实现：`src/context/shell-layers.mjs:1-18` 注入 name/id、status、command、cwd、lines、recent_output；输出来自 `snapshot.plain`，按 2000 字符截断，不是按 200 行截断。

影响：实现比文档多了 command、cwd、lines 字段；容量策略与文档不同。按字符截断更容易控 token，但“最近 200 行”不准确。

### recent_chat

文档描述：最近 10 个 turn，每个 turn 含用户消息、turn 摘要、March 回复；turn 摘要由 March 强制生成。

实际实现：`src/context/engine.mjs:78-88` 最多保留 20 个 turn；`src/context/engine.mjs:262-284` 输出 `[recent_chat]`，包含可选 `<CompactedHistory>`、`[user]`、`[March]`、`<WorkSummary>` 和可选 assistant message。`src/agent/runner.mjs:146-178` 在每个 turn 的主模型调用完成后关闭 tools 和 thinking，额外发起一次 summary prompt 生成摘要，然后 `engine.recordTurn()`。

影响：文档中的“最近 10 个 turn”与实现不一致。当前 summary 是 runtime 强制后处理，不是 AI 调用 `send_turn_summary` 工具；如果文档继续提 `send_turn_summary`，会误导后续实现。

## 关键流程差异

### 模型调用前的上下文组装

文档流程要求每次 model call 前都做 context assembly。当前实际实现更窄：只有用户消息触发的主 model call 会先由 `src/main.mjs` 调用 `runner.engine.buildContext(...)` 组装 March context，然后再拼接用户消息：

```text
<context>

[user]
<prompt>
```

代码依据：`src/main.mjs:235-239`、`src/main.mjs:326-331`。

随后 `src/agent/runner.mjs:141` 通过 `activeSession.prompt(prompt, ...)` 发起模型调用。`src/context/engine.mjs:31-71` 的 `ContextEngine.buildContext(userMessage)` 是当前 March 自己的上下文组装函数。

影响：当前实现不是“每次 model call 前都 context assembly”。用户主请求 model call 前会组装 March context；post-turn summary model call 不调用 `buildContext()`，而是在 `src/agent/runner.mjs:146-178` 关闭 tools 和 thinking 后直接发送 summary prompt。也就是说 summary model call 不经过 `[system_core]` / `[open_files]` / `[recent_chat]` 这套 March context layers。

实际用户主请求确实会在对应的模型调用前进行上下文组装，但层顺序、可选层出现条件、动态层边界与文档不同。

### 文件被外部修改

文档描述 watcher 实时刷新 open files，并让 diagnostics 旧版本标记 stale。

实际只有 open files 在 `buildContext()` 前同步重读；文件删除时内部设置 stale，但上下文不展示 stale；diagnostics stale 流程未实现。

### 编译器产生错误

文档描述 LSP 和 typecheck runner 产生 diagnostics 并注入上下文。

实际没有对应实现。当前 CLI 仍主要依赖 shell 输出、用户运行命令或工具结果暴露错误。
