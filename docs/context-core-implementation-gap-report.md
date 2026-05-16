# 上下文核心模型实现差异报告

最后更新：2026-05-14

## 结论

当前代码没有完全实现 `docs/context-core.md` 描述的新上下文核心模型。

主要差异不是字段缺失，而是部分上下文层的数据源还没补齐：`[session_identity]` 和 `[workspace_status]` 已拆出；`[diagnostics]` 尚未落地，`[workspace_status]` 还缺 git 状态和最近变更摘要。

建议下一步先补 `[diagnostics]`，再补齐 `[workspace_status]` 的 git 状态和最近变更摘要。

## 当前实现概览

实际上下文组装入口在 `src/context/engine.mjs`。

当前主要顺序：

```text
[system_core]
[injections]
[session_identity]
[project_context]
[diagnostics]
[workspace_status]
[shells]
[recent_chat]
```

文档目标顺序：

```text
[system_core]
[injections]
[tools]
[session_identity]
[diagnostics]
[workspace_status]
[runtime_status]
[shells]
[recent_chat]
```

## 关键差异

| 优先级 | 差异 | 当前代码 | 文档要求 | 影响 |
|---|---|---|---|---|
| P0 | `diagnostics` 缺失 | 无上下文诊断层 | 独立 `[diagnostics]` | AI 不能从上下文看到当前编译、LSP、lint 问题 |
| P1 | `workspace_status` 数据不完整 | 已有项目路径 | 项目路径、git 状态、最近变更 | AI 仍缺少当前工作区变更事实 |
| P1 | 当前 turn 的 recall hint 不在 `[recent_chat]` | 拼在最终 prompt 的 `[user]` 后 | 跟随消息附加在 `[recent_chat]` 中 | 语义上可用，但与文档模型不一致 |
| P2 | `shells` 按字符截断 | 2000 字符 | 最近 200 行纯文本 | 长行/短行场景下摘要边界不符合文档 |

## 分项说明

### 1. `diagnostics` 需要新增上下文层

当前没有 `src/context/*diagnostic*` 实现。

文档要求 `[diagnostics]` 承载 LSP、编译器、linter 的结构化问题：

```text
source
severity
absolute path
range
message
code
related information
```

处理建议：

1. 先实现空层或轻量 adapter，保证层顺序稳定。
2. 第一阶段可接 typecheck/lint runner 的最新结果。
3. 第二阶段再接 LSP client 的 `textDocument/publishDiagnostics`。

### 2. `workspace_status` 还需要补数据源

当前实现位置：`src/context/session-status.mjs`

当前 `[workspace_status]` 已包含：

```text
project
```

文档还要求：

```text
git 仓库状态
最近变更文件摘要
```

处理建议：

1. 先接短格式 git status，不放 diff。
2. 最近变更摘要只放路径和状态，不放文件正文。
3. 保持该层为短摘要，不放文件正文或 diff。

### 3. `recent_chat` 数量和召回位置需要统一

当前实现位置：`src/context/engine.mjs`、`src/main.mjs`

当前差异：

```text
历史 turn 的 recall hints 会进入 [recent_chat]
当前用户消息的 recall hints 拼在最终 prompt 的 [user] 后
```

文档要求：

```text
recent_chat 最近 10 个 turn
每条消息后附加 recall hints
```

处理建议：

1. 明确当前 turn 的用户消息是否属于 `[recent_chat]` 之外的尾部消息。
2. 如果保持当前 prompt 尾部结构，应更新文档；如果严格按文档，应调整组装模型。

### 4. `shells` 摘要边界不同

当前实现位置：`src/context/shell-layers.mjs`

当前实现按 2000 字符截断：

```js
truncateText(snapshot.plain, 2000)
```

文档要求最近 200 行纯文本输出。

处理建议：

1. 改为按行截取最后 200 行。
2. 保留 ANSI 剥离后的 `plain` 作为输入。

## 已基本一致的部分

### `system_core`

位置：`src/context/system-core.mjs`

基本符合文档：

```text
按 modelId 选择 model-specific system prompt
provider 不参与 prompt 选择
thinking 不写入上下文文本
```

### `injections`

位置：`src/context/injections.mjs`、`src/mcp/index.mjs`

基本符合文档：

```text
MCP instructions 进入 [injections]
MCP tools 进入 [tools]
空 injection 不输出
```

### `tools`

位置：`src/context/engine.mjs`、`src/agent/runner-session-state.mjs`

基本符合文档：

```text
[tools] 位于 [injections] 后、环境状态前
内容是工具名、描述、参数摘要
完整 schema 留在 runtime tool registry
```

### skills 已迁移到 memory

已移除 `[available_skills]`、`[active_skills]`、skill 启动扫描、skill CLI 入口和 skill 管理工具。原技能类方法论应保存为 memory 文档，由 passive recall 提示线索，再通过 `memory_open` 主动读取正文。

## 建议推进顺序

1. 新增 `[diagnostics]` 层，先实现稳定空层或命令型诊断 adapter。
2. 补齐 `[workspace_status]` 的 git 状态和最近变更摘要。
3. 明确当前 turn recall 的归属。
4. 将 `shells` 改为最近 200 行。

## 风险判断

如果直接补字段而不先拆层，会继续扩大旧模型的复杂度。这里的关键不是“多输出一点信息”，而是把不同稳定性的事实放回正确层级，避免高频变化内容污染 provider prefix cache。

## 已处理

### 旧 `[memory]` 上下文层已移除

已删除 `src/context/memory-layer.mjs`，并停止在 `ContextEngine.buildContext()` 中注入 `[memory]`。记忆系统只保留 passive recall hints 和主动 memory 工具，符合 `docs/context-core.md` 的边界。

### `session_status` 已拆分

已将旧 `[session_status]` 拆成 `[session_identity]` 和 `[workspace_status]`。`[session_identity]` 保留 cwd、workspace root、平台、shell；`[workspace_status]` 保留项目路径。

### 常驻目录树已移除

`[workspace_status]` 不再注入 `Directory tree`。需要导航时由 AI 通过 `glob` / `grep` 按需查询，避免每次 model call 常驻低信噪比目录摘要。

### `recent_chat` 保留窗口已改为 10

已将 `ContextEngine.recordTurn()` 的历史 turn 保留窗口从 20 改为 10，和 `docs/context-core.md` 以及 passive recall 的 rolling suppression window 对齐。

### 常驻文件正文层已移除

文件正文不再作为常驻上下文层注入。AI 需要文件内容时通过 `read` 读取当前磁盘内容；修改文件时通过 `edit_file` 在工具执行阶段读取磁盘并应用 patch。
