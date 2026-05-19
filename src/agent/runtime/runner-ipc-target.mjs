export function createRunnerIpcTarget({ createRunnerImpl, runnerOptions = {} } = {}) {
  if (typeof createRunnerImpl !== "function") throw new Error("createRunnerImpl is required");

  let runner = null;

  return {
    async init(options = {}) {
      if (runner) return getRunnerState(runner);
      runner = await createRunnerImpl({ ...runnerOptions, ...options });
      return getRunnerState(runner);
    },
    async runTurn(prompt, userMessage, options = {}) {
      return getRunner().runTurn(prompt, userMessage, options);
    },
    abort() {
      return getRunner().abort();
    },
    async cycleModel() {
      const result = await getRunner().cycleModel();
      return { result, state: getRunnerState(runner) };
    },
    async setModel(model) {
      const result = await getRunner().setModel(model);
      return { result, state: getRunnerState(runner) };
    },
    getCurrentModel() {
      return getRunner().getCurrentModel();
    },
    getScopedModels() {
      return getRunner().getScopedModels();
    },
    getConfiguredProviders() {
      return getRunner().getConfiguredProviders();
    },
    getSessionStats() {
      return getRunner().getSessionStats();
    },
    getState() {
      return getRunnerState(getRunner());
    },
    getLastNotificationResult() {
      return getRunner().getLastNotificationResult();
    },
    notifyTest(options) {
      return getRunner().notifyTest(options);
    },
    estimateContextTokens(userMessage = "") {
      return getRunner().estimateContextTokens(userMessage);
    },
    setSessionName(name) {
      const result = getRunner().setSessionName(name);
      return { result, state: getRunnerState(runner) };
    },
    canSwitchPiSession() {
      return getRunner().canSwitchPiSession();
    },
    async startNewSession() {
      const result = await getRunner().startNewSession();
      return { result, state: getRunnerState(runner) };
    },
    getExtensionDiagnostics() {
      return getRunner().getExtensionDiagnostics();
    },
    getExtensionLifecycleState() {
      return getRunner().getExtensionLifecycleState();
    },
    getLspStatus() {
      return getRunner().getLspStatus();
    },
    async switchPiSession(sessionPath, restoreState = null) {
      const result = await getRunner().switchPiSession(sessionPath, restoreState);
      return { result, state: getRunnerState(runner) };
    },
    cycleThinkingLevel() {
      const result = getRunner().cycleThinkingLevel();
      return { result, state: getRunnerState(runner) };
    },
    getThinkingLevel() {
      return getRunner().getThinkingLevel();
    },
    setThinkingLevel(level) {
      const result = getRunner().setThinkingLevel(level);
      return { result, state: getRunnerState(runner) };
    },
    getAvailableThinkingLevels() {
      return getRunner().getAvailableThinkingLevels();
    },
    async dispose() {
      if (!runner) return;
      const active = runner;
      runner = null;
      await active.dispose();
    },
  };

  function getRunner() {
    if (!runner) throw new Error("runtime runner is not initialized");
    return runner;
  }
}

export function getRunnerState(runner) {
  const currentModel = runner.getCurrentModel?.() ?? null;
  const scopedModels = runner.getScopedModels?.() ?? [];
  const thinkingLevel = runner.getThinkingLevel?.() ?? runner.engine?.thinkingLevel ?? null;
  return {
    engine: {
      cwd: runner.engine?.cwd ?? null,
      modelId: runner.engine?.modelId ?? currentModel?.id ?? null,
      provider: runner.engine?.provider ?? currentModel?.provider ?? null,
      thinkingLevel,
      sessionName: runner.engine?.sessionName ?? "",
      turns: runner.engine?.turns ?? [],
    },
    currentModel,
    scopedModels,
    configuredProviders: runner.getConfiguredProviders?.() ?? [],
    availableThinkingLevels: runner.getAvailableThinkingLevels?.() ?? [],
    canSwitchPiSession: runner.canSwitchPiSession?.() ?? false,
    sessionStats: runner.getSessionStats?.() ?? null,
    lspStatus: runner.getLspStatus?.() ?? null,
    extensionDiagnostics: runner.getExtensionDiagnostics?.() ?? [],
    extensionLifecycleState: runner.getExtensionLifecycleState?.() ?? null,
  };
}
