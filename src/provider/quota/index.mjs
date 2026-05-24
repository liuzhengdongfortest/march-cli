import { fetchOpenAICodexQuota, parseOpenAICodexQuotaEvent, parseOpenAICodexQuotaHeaders } from "./codex.mjs";

const quotaAdapters = new Map([
  ["openai-codex", {
    refresh: fetchOpenAICodexQuota,
    observeHeaders: parseOpenAICodexQuotaHeaders,
    observeEvent: parseOpenAICodexQuotaEvent,
  }],
]);

export function supportsProviderQuota(providerId) {
  return quotaAdapters.has(providerId);
}

export async function getProviderQuotaSnapshot({ providerId, model, authStorage, fetchImpl, now } = {}) {
  const adapter = quotaAdapters.get(providerId);
  if (!adapter) return null;
  return adapter.refresh({ authStorage, model, fetchImpl, now });
}

export function observeProviderQuotaHeaders({ providerId, headers, model, capturedAt } = {}) {
  const adapter = quotaAdapters.get(providerId);
  return adapter?.observeHeaders?.(headers, { model, capturedAt }) ?? null;
}

export function observeProviderQuotaEvent({ providerId, payload, model, capturedAt } = {}) {
  const adapter = quotaAdapters.get(providerId);
  return adapter?.observeEvent?.(payload, { model, capturedAt }) ?? null;
}

export function createProviderQuotaService({ authStorage, fetchImpl = fetch, now = () => new Date() } = {}) {
  return {
    supports(providerId) {
      return supportsProviderQuota(providerId);
    },
    refresh(model) {
      return getProviderQuotaSnapshot({ providerId: model?.provider, model, authStorage, fetchImpl, now: now() });
    },
    observeHeaders(headers, model) {
      return observeProviderQuotaHeaders({ providerId: model?.provider, headers, model, capturedAt: now().toISOString() });
    },
    observeEvent(payload, model) {
      return observeProviderQuotaEvent({ providerId: model?.provider, payload, model, capturedAt: now().toISOString() });
    },
  };
}
