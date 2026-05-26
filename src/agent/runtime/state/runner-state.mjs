export function createRunnerStateSnapshot(runner) {
  const currentModel = runner.getCurrentModel?.() ?? null;
  const scopedModels = runner.getScopedModels?.() ?? [];
  const thinkingLevel = runner.getThinkingLevel?.() ?? runner.engine?.thinkingLevel ?? null;
  const engine = runner.engine ?? {};
  return {
    engine: {
      cwd: engine.cwd ?? null,
      modelId: engine.modelId ?? currentModel?.id ?? null,
      provider: engine.provider ?? currentModel?.provider ?? null,
      thinkingLevel,
      sessionName: engine.sessionName ?? "",
      remoteMemorySources: engine.remoteMemorySources ?? [],
      turns: engine.turns ?? [],
      recentRecallMemoryIds: [...(engine.getRecentRecallMemoryIds?.() ?? [])],
    },
    currentModel,
    scopedModels,
    configuredProviders: runner.getConfiguredProviders?.() ?? [],
    availableThinkingLevels: runner.getAvailableThinkingLevels?.() ?? [],
    canSwitchPiSession: runner.canSwitchPiSession?.() ?? false,
    sessionStats: runner.getSessionStats?.() ?? null,
    providerQuota: runner.getCachedProviderQuotaSnapshot?.() ?? null,
    lspStatus: runner.getLspStatus?.() ?? null,
    extensionDiagnostics: runner.getExtensionDiagnostics?.() ?? [],
    extensionLifecycleState: runner.getExtensionLifecycleState?.() ?? null,
  };
}

export function createRunnerEngineStateFacade({ getState }) {
  return {
    get cwd() { return engineState(getState()).cwd ?? null; },
    get modelId() { return engineState(getState()).modelId ?? null; },
    get provider() { return engineState(getState()).provider ?? null; },
    get thinkingLevel() { return engineState(getState()).thinkingLevel ?? null; },
    get sessionName() { return engineState(getState()).sessionName ?? ""; },
    get remoteMemorySources() { return engineState(getState()).remoteMemorySources ?? []; },
    get turns() { return engineState(getState()).turns ?? []; },
    getRecentRecallMemoryIds() {
      return engineState(getState()).recentRecallMemoryIds ?? [];
    },
    restoreSession() {
      throw new Error("remote runner session restore is not available");
    },
  };
}

function engineState(state) {
  return state?.engine ?? {};
}
