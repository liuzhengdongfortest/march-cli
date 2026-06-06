import { SessionManager } from "@earendil-works/pi-coding-agent";

export function createDefaultSessionManager(cwd) {
  return SessionManager.inMemory(cwd);
}

export function resolveRunnerSessionManager(cwd, sessionManager = null) {
  return sessionManager ?? createDefaultSessionManager(cwd);
}

export function resolveInitialModel({ modelRegistry, provider, modelId, providers = {} }) {
  const providerIds = resolveConfiguredProviderIds({ provider, providers });
  if (modelId) {
    for (const providerId of providerIds) {
      const model = modelRegistry.find?.(providerId, modelId);
      if (model) return model;
    }
    return null;
  }
  if (providerIds.length !== 1) return null;
  const providerId = providerIds[0];
  return (modelRegistry.getAll?.() ?? []).find((model) => model.provider === providerId) ?? null;
}

function resolveConfiguredProviderIds({ provider, providers = {} }) {
  if (provider) return [provider];
  return Object.keys(providers ?? {}).filter((id) => {
    const profile = providers[id];
    return profile && typeof profile === "object" && !Array.isArray(profile);
  });
}
