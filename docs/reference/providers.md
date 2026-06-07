# Provider Configuration

March treats providers as a transport boundary: they connect to model APIs, expose model metadata, and hold authentication details. Provider choice does not change context assembly, tool registration, or March's runtime policy.

```text
User config → Provider Registry → Selected Model → pi provider transport
                              │
                              └── modelId → model-specific system prompt
```

## Built-in and custom providers

Built-in providers are registered by March. Custom providers are added through `.march/config.json` with the `openai-compatible` type.

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

- `type`: must be `openai-compatible` for custom providers.
- `name`: display name used by UI and status output.
- `baseUrl`: endpoint root, usually ending in `/v1`.
- `api`: `openai-completions` by default; `openai-responses` is also supported.
- `auth.method`: currently `apiKey` for custom providers.
- `auth.apiKey`: API key sent only to this provider.
- `headers`: optional string headers for provider-specific requirements.
- `models`: non-empty list of models exposed by this provider.

## Model fields

- `id`: model id sent to the provider.
- `name`: display name; defaults to `id`.
- `contextWindow`: defaults to `128000`.
- `maxTokens`: defaults to `4096`.
- `reasoning`: defaults to `false`.
- `input`: defaults to `["text"]`; use `["text", "image"]` for vision-capable models.
- `compat`: optional pi OpenAI-compatible settings for provider quirks.

## Share and reuse boundaries

Provider profiles can be reused across sessions because they are configuration, not runtime state. Keep these boundaries clear:

- Share provider definitions when the endpoint, auth method, headers, and model list are stable.
- Select `provider` and `model` per workspace/session when different projects need different defaults.
- Do not put March behavior rules in provider config; use project instructions and context layers instead.
- Do not rely on environment-wide API keys for custom provider isolation; the profile's auth belongs to that provider id.

## What providers do not own

Providers do not decide which tools are available, when memory is recalled, how recent chat is assembled, or how files are edited. Those decisions stay in March runtime capabilities and context assembly. The only context-related provider effect is the selected `modelId`, which chooses the model-specific system prompt when one exists.
