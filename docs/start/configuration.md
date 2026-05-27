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

## Network proxy

March installs one network environment for its internal HTTP requests. Configure it in `~/.march/config.json` for a global default, or in `<project>/.march/config.json` for a project override.

Use an explicit proxy:

```json
{
  "network": {
    "proxy": "http://127.0.0.1:7890",
    "ca": "system"
  }
}
```

The scheme is optional; `127.0.0.1:7890` is treated as `http://127.0.0.1:7890`.

Proxy resolution order:

1. `network.proxy` in March config.
2. `HTTPS_PROXY`, `HTTP_PROXY`, or `ALL_PROXY` environment variables.
3. Windows system proxy when `network.proxy` is `"system"` or omitted.
4. Direct connection.

Disable proxy explicitly:

```json
{
  "network": {
    "proxy": "direct"
  }
}
```

`"none"` and `false` are also treated as direct mode.

Set bypass rules with `network.noProxy`:

```json
{
  "network": {
    "proxy": "http://127.0.0.1:7890",
    "noProxy": ["localhost", "127.0.0.1", "*.local"]
  }
}
```

Temporary shell configuration also works:

```powershell
$env:HTTPS_PROXY="http://127.0.0.1:7890"
$env:HTTP_PROXY="http://127.0.0.1:7890"
march
```

Note: March applies this through Undici's global dispatcher. Libraries or transports that open their own sockets may need separate proxy support.

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
