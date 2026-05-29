# 桌面端

March 桌面端是包在本地 Web UI runtime 外面的 Electron 壳。Agent 仍在本机运行，只是从浏览器标签页变成原生窗口。

```text
桌面窗口
  → 本地 March Web runtime
  → 当前 workspace session
```

## 开发模式

```bash
npm run desktop:dev
```

打开指定 workspace：

```bash
npm run desktop:dev -- --workspace path/to/project
```

## 使用生产 Web UI build

```bash
npm run desktop
```

## 边界

桌面层只负责原生窗口：

- 窗口生命周期
- 加载本地地址
- 外部链接交给系统浏览器
- 启动和关闭本地 Web UI runtime

Agent 行为、供应商配置、记忆、工具和 workspace session 继续复用 March runtime。
