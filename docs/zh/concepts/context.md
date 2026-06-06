# 上下文模型

March 把 Agent Run 的初始上下文当作每次重新构造的状态。Agent Run 过程中，pi-agent 通过追加模型输出、工具调用、工具结果和隐藏 steer message 推进 transcript。

```text
稳定指令
  → 会话身份
  → 最近对话摘要
  → 记忆 hints
  → 通过工具读取当前项目事实
```

## 原则

仓库是真相来源。March 在需要时读取文件和终端状态，而不是把容易过期的快照长期钉在 prompt 里。

## 层

- `system_core`：March 行为、安全规则和模型专属补充提示
- `injections`：MCP 或扩展明确注入的外部指令
- `session_identity`：cwd、workspace root、memory root、平台和 shell
- `recent_chat`：最近 Agent Runs，加上紧凑的 recall hints

运行时边界见 [Runtime Core Boundary](/concepts/runtime-core)。完整设计笔记见 [上下文核心模型](/context-core)。
