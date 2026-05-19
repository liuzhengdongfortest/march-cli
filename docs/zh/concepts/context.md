# 上下文模型

March 把上下文当作每次重新构造的状态，而不是不断增长的聊天记录。

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
- `recent_chat`：最近 turn，加上紧凑的 recall hints

完整设计笔记见 [上下文核心模型](/context-core)。
