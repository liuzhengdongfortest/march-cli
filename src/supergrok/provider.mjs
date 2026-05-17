import { DEFAULT_SUPERGROK_MODEL, SUPERGROK_OAUTH_PROVIDER_ID, XAI_BASE_URL, XAI_OAUTH_COMPAT_PROVIDER_ID } from "./constants.mjs";
import { registerSuperGrokOAuthProvider, superGrokOAuthProvider } from "./oauth-provider.mjs";

const GROK_MODELS = [
  { id: "grok-4.3", name: "Grok 4.3", contextWindow: 1000000, maxTokens: 128000 },
  { id: "grok-4.20-reasoning", name: "Grok 4.20 Reasoning", contextWindow: 2000000, maxTokens: 128000 },
  { id: "grok-4.20-non-reasoning", name: "Grok 4.20 Non Reasoning", contextWindow: 2000000, maxTokens: 128000 },
  { id: "grok-4.20-multi-agent", name: "Grok 4.20 Multi Agent", contextWindow: 2000000, maxTokens: 128000 },
  { id: "grok-code-fast-1", name: "Grok Code Fast 1", contextWindow: 256000, maxTokens: 128000 },
];

export function registerSuperGrokProvider(modelRegistry) {
  registerSuperGrokOAuthProvider();
  if (!modelRegistry?.registerProvider) return;
  for (const providerId of [SUPERGROK_OAUTH_PROVIDER_ID, XAI_OAUTH_COMPAT_PROVIDER_ID]) {
    modelRegistry.registerProvider(providerId, {
      name: providerId === SUPERGROK_OAUTH_PROVIDER_ID ? "SuperGrok" : "xAI OAuth",
      baseUrl: XAI_BASE_URL,
      api: "openai-responses",
      oauth: { ...superGrokOAuthProvider, id: providerId },
      models: GROK_MODELS.map((model) => ({
        ...model,
        api: "openai-responses",
        baseUrl: XAI_BASE_URL,
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        compat: { supportsLongCacheRetention: true },
      })),
    });
  }
}

export function getDefaultSuperGrokModelId() {
  return DEFAULT_SUPERGROK_MODEL;
}