import { createRunnerEngineStateFacade } from "./state/runner-state.mjs";

export function createRemoteRunnerClient(peer, { initialState = null } = {}) {
  let state = initialState;
  const engineFacade = createRunnerEngineStateFacade({
    getState: () => state,
  });

  const client = {
    get engine() { return engineFacade; },
    get runtimeState() { return state; },
    async init(options = {}) {
      state = await peer.call("init", options);
      return state;
    },
    async runTurn(prompt, userMessage, options = {}) {
      const result = await peer.call("runTurn", prompt, userMessage, options);
      await refreshState();
      return result;
    },
    abort: () => peer.call("abort"),
    async cycleModel() { return applyResultWithState(await peer.call("cycleModel")); },
    async setModel(model) { return applyResultWithState(await peer.call("setModel", model)); },
    getCurrentModel: () => state?.currentModel ?? null,
    getScopedModels: () => state?.scopedModels ?? [],
    getConfiguredProviders: () => state?.configuredProviders ?? [],
    getSessionStats: () => state?.sessionStats ?? null,
    getCachedProviderQuotaSnapshot: () => state?.providerQuota ?? null,
    async getProviderQuotaSnapshot(options = {}) { return applyResultWithState(await peer.call("getProviderQuotaSnapshot", options)); },
    async refreshState() { return refreshState(); },
    getLastNotificationResult: () => peer.call("getLastNotificationResult"),
    notifyTest: (options) => peer.call("notifyTest", options),
    estimateContextTokens: (userMessage = "") => peer.call("estimateContextTokens", userMessage),
    async setSessionName(name) { return applyResultWithState(await peer.call("setSessionName", name)); },
    canSwitchPiSession: () => Boolean(state?.canSwitchPiSession),
    async startNewSession() { return applyResultWithState(await peer.call("startNewSession")); },
    getExtensionDiagnostics: () => state?.extensionDiagnostics ?? [],
    getExtensionLifecycleState: () => state?.extensionLifecycleState ?? null,
    getLspStatus: () => state?.lspStatus ?? null,
    async switchPiSession(sessionPath, restoreState = null) { return applyResultWithState(await peer.call("switchPiSession", sessionPath, restoreState)); },
    async cycleThinkingLevel() { return applyResultWithState(await peer.call("cycleThinkingLevel")); },
    getThinkingLevel: () => state?.engine?.thinkingLevel ?? null,
    async setThinkingLevel(level) { return applyResultWithState(await peer.call("setThinkingLevel", level)); },
    getAvailableThinkingLevels: () => state?.availableThinkingLevels ?? [],
    async dispose() {
      await peer.call("dispose");
      peer.dispose();
    },
  };

  return client;

  async function refreshState() {
    state = await peer.call("getState");
    return state;
  }

  function applyResultWithState(response) {
    if (response && Object.hasOwn(response, "state")) {
      state = response.state;
      return response.result;
    }
    return response;
  }

}
