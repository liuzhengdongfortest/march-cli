import { fetchOpenAICodexQuota } from "./codex.mjs";

const quotaAdapters = new Map([
  ["openai-codex", { refresh: fetchOpenAICodexQuota }],
]);

export function supportsProviderQuota(providerId) {
  return quotaAdapters.has(providerId);
}

export async function getProviderQuotaSnapshot({ providerId, model, authStorage, fetchImpl, now } = {}) {
  const adapter = quotaAdapters.get(providerId);
  if (!adapter) return null;
  return adapter.refresh({ authStorage, model, fetchImpl, now });
}

export function createProviderQuotaService({ authStorage, fetchImpl = fetch, now = () => new Date() } = {}) {
  return {
    supports(providerId) {
      return supportsProviderQuota(providerId);
    },
    refresh(model) {
      return getProviderQuotaSnapshot({ providerId: model?.provider, model, authStorage, fetchImpl, now: now() });
    },
  };
}
