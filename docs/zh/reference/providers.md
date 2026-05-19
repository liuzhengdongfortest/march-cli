# 自定义 Provider

March 通过 `.march/config.json` 支持 OpenAI-compatible provider。

## 最小 provider

```json
{
  "providers": {
    "my-local": {
      "type": "openai-compatible",
      "name": "My Local Provider",
      "baseUrl": "http://localhost:1234/v1",
      "api": "openai-completions",
      "auth": {
        "method": "apiKey",
        "apiKey": "YOUR_API_KEY"
      },
      "models": [
        {
          "id": "qwen-coder",
          "name": "Qwen Coder",
          "contextWindow": 128000,
          "maxTokens": 8192
        }
      ]
    }
  },
  "provider": "my-local",
  "model": "qwen-coder"
}
```

## Provider 字段

- `type`：必须是 `openai-compatible`
- `baseUrl`：endpoint 根地址，通常以 `/v1` 结尾
- `api`：默认是 `openai-completions`；也支持 `openai-responses`
- `auth.apiKey`：传给自定义 provider id 的 API key
- `headers`：可选字符串 headers
- `models`：该 provider 暴露的模型列表，不能为空

## Model 字段

- `id`：发送给 provider 的模型 id
- `name`：显示名称；默认使用 `id`
- `contextWindow`：默认 `128000`
- `maxTokens`：默认 `4096`
- `reasoning`：默认 `false`
- `input`：默认 `["text"]`；视觉模型使用 `["text", "image"]`
- `compat`：可选 pi OpenAI-compatible 兼容设置，用于处理 provider 差异
