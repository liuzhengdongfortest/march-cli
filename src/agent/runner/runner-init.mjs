import { SessionManager } from "@mariozechner/pi-coding-agent";

export function createDefaultSessionManager(cwd) {
  return SessionManager.inMemory(cwd);
}

export function resolveRunnerSessionManager(cwd, sessionManager = null) {
  return sessionManager ?? createDefaultSessionManager(cwd);
}

export function resolveInitialModel({ modelRegistry, provider, modelId }) {
  const available = modelRegistry.getAvailable?.() ?? [];
  if (provider && modelId) return available.find((model) => model.provider === provider && model.id === modelId) ?? null;
  return available[0] ?? null;
}
