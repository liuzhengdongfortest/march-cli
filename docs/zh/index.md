# March CLI

March 是一个终端原生的编程 Agent。它每轮重新组装上下文，直接在你的仓库里工作，并把长期知识保存为 Markdown。

## 从这里开始

- [安装 March](/zh/start/install)
- [配置 Provider](/zh/start/configuration)
- [理解上下文模型](/zh/concepts/context)
- [了解 Markdown 记忆](/zh/concepts/memory)

## March 保持简单的部分

| 领域 | 做法 |
| --- | --- |
| 上下文 | 每次 model call 前从稳定层重新组装。 |
| 记忆 | 保存为普通 Markdown 文件，召回时先注入轻量 hint。 |
| 工具 | 文件编辑、终端命令、Web 访问和 MCP 集成都通过明确 tool call 执行。 |
| 验证 | 修改代码后，尽量运行相关测试或检查。 |

## 一个 Turn 如何工作

```text
用户请求
  → 上下文组装
  → 模型调用
  → 必要时执行工具调用
  → 验证
  → 最终报告
```

March 的设计重点是：源码可读、边界清楚、运行时状态可丢弃。
