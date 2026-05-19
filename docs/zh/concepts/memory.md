# 记忆系统

March 把长期知识保存为 Markdown 文件。

```text
Markdown memory files
  → Frontmatter parser
  → Disposable search index
  → Recall hint
  → memory_open 在需要全文时读取
```

## 什么值得记住

好的记忆通常是稳定事实、可复用决策、项目约定，或一次绕路之后得到的经验。

## 什么不会自动注入

March 不会把所有记忆正文塞进每次 prompt。它先召回紧凑 hint，只有任务需要时才打开准确的记忆文件。

## 存储

默认情况下，记忆放在 March memory root 下。它们是普通 Markdown，用户可以直接查看和编辑。

完整设计笔记见 [Markdown 记忆系统](/markdown-memory-system)。
