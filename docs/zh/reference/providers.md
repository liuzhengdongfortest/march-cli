# Provider 配置

March 把 provider 视为传输边界：连接模型 API、暴露模型元数据、保存鉴权信息。选择 provider 不会改变 context assembly、tool 注册或 March runtime policy。

```text
用户配置 → Provider Registry → Selected Model → pi provider transport
                                  │
                                  └── modelId → model-specific system prompt
```

## 内置与自定义 Provider

内置 provider 由 March 注册。自定义 provider 通过 `.march/config.json` 添加，类型是 `openai-compatible`。

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

- `type`：自定义 provider 必须是 `openai-compatible`。
- `name`：UI 和状态输出使用的显示名称。
- `baseUrl`：endpoint 根地址，通常以 `/v1` 结尾。
- `api`：默认是 `openai-completions`；也支持 `openai-responses`。
- `auth.method`：自定义 provider 当前使用 `apiKey`。
- `auth.apiKey`：只发送给这个 provider 的 API key。
- `headers`：可选字符串 headers，用于 provider 特定要求。
- `models`：该 provider 暴露的模型列表，不能为空。

## Model 字段

- `id`：发送给 provider 的模型 id。
- `name`：显示名称；默认使用 `id`。
- `contextWindow`：默认 `128000`。
- `maxTokens`：默认 `4096`。
- `reasoning`：默认 `false`。
- `input`：默认 `["text"]`；视觉模型使用 `["text", "image"]`。
- `compat`：可选 pi OpenAI-compatible 兼容设置，用于处理 provider 差异。

## 共享与复用边界

Provider profile 可以跨 session 复用，因为它是配置，不是运行时状态。边界保持清晰：

- endpoint、鉴权方式、headers、模型列表稳定时，可以共享 provider 定义。
- 不同项目需要不同默认模型时，在 workspace/session 里选择 `provider` 和 `model`。
- 不要把 March 行为规则放进 provider config；行为规则应放在项目指令和 context layers。
- 不要依赖全局环境变量来隔离自定义 provider；profile 的 auth 属于对应 provider id。

## Provider 不负责什么

Provider 不决定可用 tools、memory 何时召回、recent chat 如何组装，也不决定文件如何编辑。这些职责属于 March runtime capabilities 和 context assembly。Provider 对 context 的唯一相关影响是已选择的 `modelId`：如果存在模型专属 system prompt，会由它选择对应提示。
