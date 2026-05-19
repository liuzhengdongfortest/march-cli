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
