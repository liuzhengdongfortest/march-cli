# 配置

March 从两个位置读取配置：

```text
~/.march/config.json              # 全局默认配置
<project>/.march/config.json      # 项目级覆盖配置
```

## 最小配置

```json
{
  "provider": "openai",
  "model": "gpt-5.1"
}
```

当两个配置同时存在时，项目配置会覆盖全局配置。

## 网络代理

March 会为内部 HTTP 请求安装统一的网络环境。全局默认配置写在 `~/.march/config.json`，项目级覆盖配置写在 `<project>/.march/config.json`。

显式指定代理：

```json
{
  "network": {
    "proxy": "http://127.0.0.1:7890",
    "ca": "system"
  }
}
```

协议可以省略；`127.0.0.1:7890` 会被当成 `http://127.0.0.1:7890`。

代理解析顺序：

1. March 配置里的 `network.proxy`。
2. `HTTPS_PROXY`、`HTTP_PROXY` 或 `ALL_PROXY` 环境变量。
3. 当 `network.proxy` 为 `"system"` 或未配置时，读取 Windows 系统代理。
4. 直连。

显式禁用代理：

```json
{
  "network": {
    "proxy": "direct"
  }
}
```

`"none"` 和 `false` 也会被视为直连模式。

用 `network.noProxy` 设置绕过规则：

```json
{
  "network": {
    "proxy": "http://127.0.0.1:7890",
    "noProxy": ["localhost", "127.0.0.1", "*.local"]
  }
}
```

临时使用 Shell 环境变量也可以：

```powershell
$env:HTTPS_PROXY="http://127.0.0.1:7890"
$env:HTTP_PROXY="http://127.0.0.1:7890"
march
```

注意：March 通过 Undici 的全局 dispatcher 应用代理。如果某些库或 transport 自己打开 socket，可能还需要单独支持代理。

## 自定义 Provider

当你使用本地模型或 OpenAI-compatible 网关时，可以配置自定义 provider。

```json
{
  "providers": {
    "local-openai": {
      "type": "openai-compatible",
      "baseUrl": "http://localhost:1234/v1",
      "auth": { "method": "apiKey", "apiKey": "local" },
      "models": [{ "id": "qwen-coder", "contextWindow": 128000 }]
    }
  },
  "provider": "local-openai",
  "model": "qwen-coder"
}
```

完整字段见 [自定义 Provider](/zh/reference/providers)。
