# Web UI

March 也包含本地 Web UI 会话管理器。Web UI 适合在浏览器里管理和打开本地 March 会话，同时继续使用同一套 provider、记忆和项目模型。

```text
march web
  → 本地会话管理器
  → 浏览器界面
  → 选中工作区的 March runtime
```

## 启动 Web UI

```bash
march web
```

打开一个初始工作区：

```bash
march web --workspace path/to/project
```

需要时可以指定 host 或 port：

```bash
march web --host 127.0.0.1 --port 3000
```

## 开发模式

开发 Web UI 本身时，使用 Vite 热更新：

```bash
march web --dev
```

也可以指定后端 API 端口：

```bash
march web --dev --api-port 4317
```

## 同一个核心模型

Web UI 不是第二套 agent 架构。它仍然使用 March 的基本模型：

- 已配置的 provider 和模型选择
- 仓库本地工作区
- 显式工具调用
- Markdown 记忆
- 每次模型调用前组装上下文

在仓库里快速工作时，用终端 CLI 最直接。需要浏览器里的会话管理和查看体验时，用 Web UI 更方便。
