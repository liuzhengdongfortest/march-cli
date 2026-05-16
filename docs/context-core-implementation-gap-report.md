# 上下文核心模型实现差异报告

最后更新：2026-05-14

## 结论

当前代码没有完全实现 `docs/context-core.md` 描述的新上下文核心模型。

主要差异不是字段缺失，而是部分上下文层的数据源还没补齐：`[session_identity]` 和 `[workspace_status]` 已拆出；`[workspace_status]` 还缺 git 状态和最近变更摘要。

建议下一步补齐 `[workspace_status]` 的 git 状态和最近变更摘要。

## 当前实现概览

实际上下文组装入口在 `src/context/engine.mjs`。

当前主要顺序：

```text
[system_core]
[injections]
[session_identity]
[project_context]
[workspace_status]
[recent_chat]
```

文档目标顺序：

```text
[system_core]
[injections]
[session_identity]
[workspace_status]
[recent_chat]
```

## 关键差异

| 优先级 | 差异 | 当前代码 | 文档要求 | 影响 |
|---|---|---|---|---|
| P1 | `workspace_status` 数据不完整 | 已有项目路径 | 项目路径、git 状态、最近变更 | AI 仍缺少当前工作区变更事实 |
| P1 | 当前 turn 的 recall hint 不在 `[recent_chat]` | 拼在最终 prompt 的 `[user]` 后 | 跟随消息附加在 `[recent_chat]` 中 | 语义上可用，但与文档模型不一致 |

## 分项说明

### 1. `workspace_status` 还需要补数据源

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

### 2. `recent_chat` 数量和召回位置需要统一

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

### skills 已迁移到 memory

已移除 `[available_skills]`、`[active_skills]`、skill 启动扫描、skill CLI 入口和 skill 管理工具。原技能类方法论应保存为 memory 文档，由 passive recall 提示线索，再通过 `memory_open` 主动读取正文。

## 建议推进顺序

1. 补齐 `[workspace_status]` 的 git 状态和最近变更摘要。
2. 明确当前 turn recall 的归属。

## 风险判断

如果直接补字段而不先拆层，会继续扩大旧模型的复杂度。这里的关键不是“多输出一点信息”，而是把不同稳定性的事实放回正确层级，避免高频变化内容污染 provider prefix cache。

## 已处理

### 旧 `[memory]` 上下文层已移除

已删除 `src/context/memory-layer.mjs`，并停止在 `ContextEngine.buildContext()` 中注入 `[memory]`。记忆系统只保留 passive recall hints 和主动 memory 工具，符合 `docs/context-core.md` 的边界。

### `session_status` 已拆分

已将旧 `[session_status]` 拆成 `[session_identity]` 和 `[workspace_status]`。`[session_identity]` 保留 cwd、workspace root、平台、shell；`[workspace_status]` 保留项目路径。

### 常驻目录树已移除

`[workspace_status]` 不再注入 `Directory tree`。需要导航时由 AI 通过 `glob` / `grep` 按需查询，避免每次 model call 常驻低信噪比目录摘要。

### diagnostics 和 shells 已退出默认上下文

`[diagnostics]` 和 `[shells]` 不再由 `ContextEngine.buildContextLayers()` 注入。LSP 服务、shell runtime、shell pane、`/shell` 命令和 terminal tools 仍保留；AI 需要时按需通过工具或 UI 反馈获取这些事实。

### Shell 线索改为用户消息尾部提示

用户消息会附加极短 `[shell_hints]`，只列 shell id/name/status/command/cwd/line count，不包含输出。AI 需要内容时通过 `terminal_read` 读取；`terminal_snapshot` 保留给视觉/ANSI 调试。

### `recent_chat` 保留窗口已改为 10

已将 `ContextEngine.recordTurn()` 的历史 turn 保留窗口从 20 改为 10，和 `docs/context-core.md` 以及 passive recall 的 rolling suppression window 对齐。

### 常驻文件正文层已移除

文件正文不再作为常驻上下文层注入。AI 需要文件内容时通过 `read` 读取当前磁盘内容；修改文件时通过 `edit_file` 在工具执行阶段读取磁盘并应用 patch。
