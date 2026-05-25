# CLI 工作流

March 的默认使用方式是在当前仓库里直接启动。

```text
你 → 在项目目录运行 march
   → March 读取当前项目事实
   → March 通过明确工具修改文件或运行命令
   → March 汇报结果
```

## 启动会话

```bash
cd path/to/project
march
```

也可以直接带上一条请求：

```bash
march "解释这个包是怎么启动的"
```

如果想覆盖配置里的默认模型，可以传入 `--provider` 或 `--model`：

```bash
march --provider openai --model gpt-5.1
```

## March 看见什么

March 不会假设整个仓库已经在 prompt 里。它先带着稳定上下文启动，然后按任务需要读取文件和命令输出。

所以请求可以很直接：

```text
找到 provider 配置在哪里加载，并解释这条链路。
```

March 会先定位相关文件，打开需要的部分，然后再回答或修改。

## 常见工作循环

1. 让 March 检查或修改某件事。
2. 让它读取相关文件。
3. 查看它完成的修改或说明。
4. 对有意义的改动跑一个聚焦检查；日常开发优先跑 fast 测试。

项目里的固定规则可以放在 `AGENTS.md`。March 会把它作为项目上下文读取，这样不用每轮都重复粘贴。

## 恢复或检查会话

用 `--resume <id>` 从已有 pi session id 继续：

```bash
march --resume <id>
```

调试上下文组装时，`--dump-context` 会把 prompt 写到 `.march/context-dumps/`：

```bash
march --dump-context
```
