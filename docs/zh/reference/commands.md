# CLI 命令

本页列出 CLI help 中暴露的 March 用户命令和选项。

## 基本用法

```bash
march [options] [prompt]
march [options]
```

不带 prompt 时，March 会在当前目录启动交互式 REPL。带 prompt 时，March 会直接处理这条请求。

## Provider 命令

```bash
march provider --config
march provider remove
march provider share [id]
march provider accept <token>
march login [provider]
```

- `provider --config` 打开交互式 provider 凭据配置。
- `provider remove` 交互式移除已配置 provider。
- `provider share [id]` 创建 provider 分享 token。加 `--include-key` 会包含 API key，加 `--profile-only` 会省略 API key。
- `provider accept <token>` 导入分享的 provider profile。
- `login [provider]` 登录 OAuth provider。


## Web 搜索

```bash
march websearch --config
```

配置 Web 搜索凭据。

## 记忆命令

```bash
march memory serve [folder]
march memory add <url>
march memory list
march memory remove <name>
```

- `serve` 把一个记忆文件夹暴露为远程记忆源。
- `add` 注册远程记忆 URL。
- `list` 列出已配置的远程记忆。
- `remove` 从配置中移除远程记忆源。

常用选项：

- `serve` 可用 `--host <host>` 和 `--port <port>`
- `serve` 和 `add` 可用 `--name <name>`
- `--foreground` 让记忆服务器在当前进程运行

## 浏览器命令

```bash
march browser install
march browser status
march browser restart
```

这些命令用于管理浏览器工具依赖的开发者浏览器扩展和浏览器 daemon。

## Gateway 命令

```bash
march gateway setup
march gateway status
```

这些命令用于配置和查看 gateway 集成。

## 常用选项

| 选项 | 含义 |
| --- | --- |
| `-m, --model <id>` | 初始模型 id 覆盖 |
| `--provider <name>` | 初始 provider 覆盖 |
| `--resume <id>` | 按 id 恢复 pi session |
| `--json` | 不使用 TUI 的 JSON 输出模式 |
| `--dump-context` | 把每次模型 prompt 写到 `.march/context-dumps/` |
| `--shell-runtime` | 启用交互式 PTY shell 工具 |
| `--no-shell-runtime` | 禁用交互式 PTY shell 工具和 shell 面板 |
| `-e, --extension <path>` | 加载 pi extension 路径；可重复 |
| `-h, --help` | 显示 CLI help |
| `-v, --version` | 显示版本 |
