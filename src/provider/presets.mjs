export const PROVIDER_PRESETS = [
  {
    id: "deepseek",
    label: "DeepSeek",
    type: "deepseek",
    authMethods: ["apiKey"],
    apiKeyLabel: "DeepSeek API key",
  },
  {
    id: "openai",
    label: "OpenAI",
    type: "openai",
    authMethods: ["apiKey"],
    apiKeyLabel: "OpenAI API key",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    type: "anthropic",
    authMethods: ["apiKey"],
    apiKeyLabel: "Anthropic API key",
  },
];

export function getProviderPreset(id) {
  return PROVIDER_PRESETS.find((preset) => preset.id === id || preset.type === id) ?? null;
}

export function getProviderLabel(id) {
  return getProviderPreset(id)?.label ?? id;
}
