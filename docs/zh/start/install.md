# 安装 March

March 以 npm CLI 的形式发布，适合在本地终端中使用。全局安装后，在你希望 March 工作的项目目录里启动它。

## 环境要求

| 要求 | 说明 |
| --- | --- |
| Node.js | 20 或更高版本。 |
| 包管理器 | 默认使用 npm；pnpm 或其他 Node 包管理器也可以运行。 |
| 模型 Provider | 日常使用前至少配置一个 provider。 |

## 安装

除非你在测试本地构建，否则使用最新稳定包：

```bash
npm install -g march-cli
```

进入项目目录并启动 March：

```bash
march
```

## 配置

March 会从本地配置目录读取配置。先配置模型 provider，其他工具按需添加。

- [配置 Provider](/zh/start/configuration)
- [理解上下文组装](/zh/concepts/context)
- [了解 Markdown 记忆](/zh/concepts/memory)

## 更新

```bash
npm install -g march-cli@latest
```

## 安装之后

1. 在终端中打开一个仓库。
2. 运行 `march`。
3. 让 March 检查、解释、编辑或验证项目。
4. 如果希望项目规则自动进入上下文，把它们写在 `AGENTS.md`。

## 下一步

继续阅读 [配置](/zh/start/configuration)。
