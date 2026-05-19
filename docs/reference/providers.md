# Custom Providers

March supports OpenAI-compatible providers through `.march/config.json`.

## Minimal provider

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

## Provider fields

- `type`: must be `openai-compatible`
- `baseUrl`: endpoint root, usually ending in `/v1`
- `api`: `openai-completions` by default; `openai-responses` is also supported
- `auth.apiKey`: API key passed to the custom provider id
- `headers`: optional string headers
- `models`: non-empty list of models exposed by this provider

## Model fields

- `id`: model id sent to the provider
- `name`: display name; defaults to `id`
- `contextWindow`: defaults to `128000`
- `maxTokens`: defaults to `4096`
- `reasoning`: defaults to `false`
- `input`: defaults to `["text"]`; use `["text", "image"]` for vision-capable models
- `compat`: optional pi OpenAI-compat settings for provider quirks
