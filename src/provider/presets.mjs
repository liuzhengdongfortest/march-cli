import { getProviders } from "@earendil-works/pi-ai";
import { getOAuthProviders } from "@earendil-works/pi-ai/oauth";
import { registerSuperGrokOAuthProvider } from "../supergrok/oauth-provider.mjs";

registerSuperGrokOAuthProvider();

const PROVIDER_LABELS = {
  anthropic: "Anthropic",
  "amazon-bedrock": "Amazon Bedrock",
  "azure-openai-responses": "Azure OpenAI Responses",
  cerebras: "Cerebras",
  "cloudflare-ai-gateway": "Cloudflare AI Gateway",
  "cloudflare-workers-ai": "Cloudflare Workers AI",
  deepseek: "DeepSeek",
  fireworks: "Fireworks",
  google: "Google Gemini",
  "google-vertex": "Google Vertex AI",
  groq: "Groq",
  huggingface: "Hugging Face",
  "kimi-coding": "Kimi For Coding",
  mistral: "Mistral",
  minimax: "MiniMax",
  "minimax-cn": "MiniMax (China)",
  moonshotai: "Moonshot AI",
  "moonshotai-cn": "Moonshot AI (China)",
  opencode: "OpenCode Zen",
  "opencode-go": "OpenCode Go",
  openai: "OpenAI",
  "openai-codex": "OpenAI Codex",
  openrouter: "OpenRouter",
  "supergrok-oauth": "SuperGrok",
  "vercel-ai-gateway": "Vercel AI Gateway",
  xai: "xAI",
  "xai-oauth": "xAI OAuth",
  zai: "ZAI",
  xiaomi: "Xiaomi MiMo",
  "xiaomi-token-plan-cn": "Xiaomi MiMo Token Plan (China)",
  "xiaomi-token-plan-ams": "Xiaomi MiMo Token Plan (Amsterdam)",
  "xiaomi-token-plan-sgp": "Xiaomi MiMo Token Plan (Singapore)",
};

export const PROVIDER_PRESETS = buildProviderPresets();

export function buildProviderPresets() {
  const oauthProviderIds = new Set(getOAuthProviders().map((provider) => provider.id));
  const ids = new Set([...getProviders(), ...oauthProviderIds]);
  return [...ids].map((id) => {
    const label = getProviderLabel(id);
    return {
      id,
      label,
      type: id,
      authMethods: getAuthMethods(id, oauthProviderIds),
      apiKeyLabel: `${label} API key`,
    };
  }).sort((a, b) => a.label.localeCompare(b.label));
}

export function getProviderPreset(id) {
  return PROVIDER_PRESETS.find((preset) => preset.id === id || preset.type === id) ?? null;
}

export function getProviderLabel(id) {
  return PROVIDER_LABELS[id] ?? id;
}

function getAuthMethods(id, oauthProviderIds) {
  const methods = [];
  if (oauthProviderIds.has(id)) methods.push("oauth");
  methods.push("apiKey");
  return methods;
}
