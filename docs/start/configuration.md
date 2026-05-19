# Configuration

March reads configuration from two places:

```text
~/.march/config.json              # global default
<project>/.march/config.json      # project override
```

## Minimal config

```json
{
  "provider": "openai",
  "model": "gpt-5.1"
}
```

Project config overrides global config when both exist.

## Custom providers

Use a custom provider when you run a local model or an OpenAI-compatible gateway.

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

See [Custom Providers](/reference/providers) for the full field list.
