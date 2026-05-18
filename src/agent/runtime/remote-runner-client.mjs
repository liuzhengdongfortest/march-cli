export function createRemoteRunnerClient(peer, { initialState = null } = {}) {
  let state = initialState;

  const client = {
    get engine() { return state?.engine ?? {}; },
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
    getCurrentModel: () => peer.call("getCurrentModel"),
    getScopedModels: () => peer.call("getScopedModels"),
    getConfiguredProviders: () => peer.call("getConfiguredProviders"),
    getSessionStats: () => peer.call("getSessionStats"),
    async refreshState() { return refreshState(); },
    getLastNotificationResult: () => peer.call("getLastNotificationResult"),
    notifyTest: (options) => peer.call("notifyTest", options),
    estimateContextTokens: (userMessage = "") => peer.call("estimateContextTokens", userMessage),
    async setSessionName(name) { return applyResultWithState(await peer.call("setSessionName", name)); },
    canSwitchPiSession: () => peer.call("canSwitchPiSession"),
    async startNewSession() { return applyResultWithState(await peer.call("startNewSession")); },
    getExtensionDiagnostics: () => peer.call("getExtensionDiagnostics"),
    getExtensionLifecycleState: () => peer.call("getExtensionLifecycleState"),
    getLspStatus: () => peer.call("getLspStatus"),
    async switchPiSession(sessionPath) { return applyResultWithState(await peer.call("switchPiSession", sessionPath)); },
    async cycleThinkingLevel() { return applyResultWithState(await peer.call("cycleThinkingLevel")); },
    getThinkingLevel: () => peer.call("getThinkingLevel"),
    async setThinkingLevel(level) { return applyResultWithState(await peer.call("setThinkingLevel", level)); },
    getAvailableThinkingLevels: () => peer.call("getAvailableThinkingLevels"),
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
