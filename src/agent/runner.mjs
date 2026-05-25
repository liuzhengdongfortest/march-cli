import { createAgentSession, ModelRegistry, SettingsManager } from "@earendil-works/pi-coding-agent";
import { createMarchAuthStorage } from "../auth/storage.mjs";
import { ContextEngine } from "../context/engine.mjs";
import { createMarchLifecycleAdapter } from "../extensions/lifecycle-adapter.mjs";
import { syncPiSessionSidecar } from "../session/sidecar-sync.mjs";
import { LspService } from "../lsp/service.mjs";
import { formatLspServiceEvent } from "../lsp/status-message.mjs";
import { estimateProviderPayloadTokens, installModelPayloadDumper, replaceProviderContextMessages } from "./model-payload-dumper.mjs";
import { resolveInitialModel, resolveRunnerSessionManager } from "./runner/runner-init.mjs";
import { runRunnerCleanup } from "./runner/runner-cleanup.mjs";
import { createRunnerRuntimeHost } from "./runtime/runner-runtime-host.mjs";
import { createRuntimeUiBridge } from "./runtime/ui-event-bridge.mjs";
import { getRunnerSessionStats, syncEngineSessionState } from "./runner/runner-session-state.mjs";
import { buildNotificationActivation, installRunnerProcessGuards, notifyTurnEndBestEffort, notifyTurnEndDetached, providerContextToPayload } from "./runner/runner-utils.mjs";
import { dumpCodexTransportDebug, getCodexTransportDebugSnapshot } from "./runner/codex-transport-debug.mjs";
import { applyCodexLargeContextGuardToPayload } from "./runner/codex-large-context-guard.mjs";
import { resolveRunnerSessionOptions } from "./session/session-options.mjs";
import { createSessionBinding } from "./session/session-binding.mjs";
import { maybeAutoNameSession } from "./session/session-auto-name.mjs";
import { MARCH_BASE_TOOL_NAMES } from "./tool-names.mjs";
import { runRunnerTurn } from "./turn/turn-runner.mjs";
import { beginLoggedTurn } from "./turn/turn-logging.mjs";
import { appendFastVariants, createFastModelEntry, fromFastEntryModel, isFastProvider } from "./runner/fast-model.mjs";
import { registerSuperGrokProvider } from "../supergrok/provider.mjs";
import { registerCustomProviders } from "../provider/custom-provider.mjs";
import { injectHostedTools } from "../provider/hosted-tools.mjs";
import { createRunnerLifecycle } from "./lifecycle/runner-lifecycle.mjs";
import { createRunnerProviderQuotaRuntime } from "./runner/provider-quota-runtime.mjs";
import { appendRunnerTurnHistory, createRunnerHistoryStore } from "../history/runner.mjs";
export { MARCH_BASE_TOOL_NAMES, installModelPayloadDumper };
export { createDefaultSessionManager, resolveRunnerSessionManager } from "./runner/runner-init.mjs";
export { getRunnerSessionStats, syncEngineSessionState } from "./runner/runner-session-state.mjs";
export async function createRunner({ cwd, modelId = null, provider = null, providers = {}, stateRoot, ui, memoryRoot = null, profilePaths = null, memoryStore = null, memoryTools = [], remoteMemorySources = [], shellRuntime = null, mcpTools = [], mcpInjections = [], mcpClientManager = null, webTools = [], namespace = "", sessionManager = null, useRuntimeHost = false, projectMarchDir = null, syncPiSidecar = false, extensionPaths = [], lifecycleHooks = [], lifecycleDiagnostics = [], authStorage = null, permissionController = null, modelContextDumper = null, turnNotifier = null, logger = null, onModelPayload = null, onLspStatusChange = null, createAgentSessionImpl = createAgentSession, createAgentSessionRuntimeImpl, createRuntimeServices, createRuntimeSessionFromServices, maxTurns, trimBatch, serviceTier = null, hostedTools = {}, notificationContext = null }) {
  installRunnerProcessGuards();
  if (!useRuntimeHost && extensionPaths.length > 0) throw new Error("--extension requires the default pi runtime host path");
  const authConfig = authStorage ? { authStorage, hasAuth: true } : createMarchAuthStorage({ provider: provider ?? "deepseek", providers, cwd });
  if (!authConfig.hasAuth) throw new Error("No providers configured. Run: march provider --config");
  const resolvedAuth = authConfig.authStorage;
  const modelRegistry = ModelRegistry.create(resolvedAuth);
  registerSuperGrokProvider(modelRegistry);
  registerCustomProviders(modelRegistry, providers);
  const selectedModel = resolveInitialModel({ modelRegistry, provider, modelId });
  if (!selectedModel) throw new Error("No authenticated models available. Run: march provider --config");
  provider = selectedModel.provider;
  modelId = selectedModel.id;
  const settingsManager = SettingsManager.inMemory({
    compaction: { enabled: false },
    retry: { enabled: true, maxRetries: 3, baseDelayMs: 2000 },
  });
  const { ui: runtimeUi, eventBus: runtimeUiEvents, detach: detachRuntimeUi } = createRuntimeUiBridge(ui);
  const lspService = new LspService({ cwd, onEvent: (event) => runtimeUi.status?.(formatLspServiceEvent(event)), onStatusChange: (event) => onLspStatusChange?.(event) });
  const engine = new ContextEngine({ cwd, modelId, provider, namespace, memoryRoot, profilePaths, remoteMemorySources, shellRuntime, lspService, injections: mcpInjections, maxTurns, trimBatch });
  const historyStore = createRunnerHistoryStore({ stateRoot, cwd });
  const resolvedSessionManager = resolveRunnerSessionManager(cwd, sessionManager);
  const sessionBinding = createSessionBinding(null);
  let currentModelCallKind = "model", currentTurnId = null, currentPromptForContext = "";
  const lifecycle = createRunnerLifecycle();
  let currentTurnContextMode = "rebuild";
  let nextTurnContextMode = "rebuild";
  let lastNotificationResult = null, runtimeHost = null, lifecycleAdapter = null;
  let _currentFastEntry = null;
  if (useRuntimeHost) {
    runtimeHost = await createRunnerRuntimeHost({
      cwd, stateRoot, provider, modelId,
      authStorage: resolvedAuth, settingsManager, modelRegistry,
      providers,
      sessionManager: resolvedSessionManager, sessionBinding, engine, ui: runtimeUi,
      projectMarchDir,
      memoryTools, memoryStore, historyStore, shellRuntime, lspService, mcpTools, webTools,
      lifecycle, permissionController, extensionPaths, hostedTools,
      onRebind: (session) => {
        installModelPayloadDumper(session, modelContextDumper, () => currentModelCallKind, onLoggedModelPayload, injectMarchSystemContext);
        syncEngineSessionState(engine, session);
      },
      createAgentSessionRuntimeImpl,
      createServices: createRuntimeServices,
      createFromServices: createRuntimeSessionFromServices,
    });
  } else {
    const sessionOptions = resolveRunnerSessionOptions({
      cwd, stateRoot, provider, modelId, modelRegistry, engine, ui: runtimeUi,
      memoryTools, historyStore, shellRuntime, lspService, mcpTools, webTools, lifecycle, permissionController,
      authStorage: resolvedAuth, projectMarchDir,
      getCurrentModel: () => sessionBinding.get()?.model ?? selectedModel,
    });
    const { session } = await createAgentSessionImpl({
      cwd, agentDir: stateRoot, ...sessionOptions,
      authStorage: resolvedAuth, modelRegistry,
      sessionManager: resolvedSessionManager, settingsManager,
    });
    sessionBinding.set(session);
    installModelPayloadDumper(session, modelContextDumper, () => currentModelCallKind, onLoggedModelPayload, injectMarchSystemContext);
  }
  syncEngineSessionState(engine, sessionBinding.get());
  lifecycleAdapter = createMarchLifecycleAdapter({
    cwd, projectMarchDir, extensionPaths, sessionBinding, engine,
    getSessionStats: () => getRunnerSessionStats(sessionBinding.get(), runtimeHost),
    getRuntimeDiagnostics: () => runtimeHost?.getDiagnostics?.() ?? [],
    manifestHooks: lifecycleHooks,
    manifestDiagnostics: lifecycleDiagnostics,
  });
  if (serviceTier === "priority" && selectedModel && isFastProvider(selectedModel.provider)) {
    _currentFastEntry = createFastModelEntry(selectedModel).model;
  }
  const providerQuotaRuntime = createRunnerProviderQuotaRuntime({ authStorage: resolvedAuth, ui: runtimeUi,
    getCurrentModel: () => _currentFastEntry ?? sessionBinding.get().model });
  return {
    engine,
    get session() { return sessionBinding.get(); },
    shellRuntime,
    runtimeUiEvents,
    async runTurn(prompt, userMessage, { userRecallHints = [], currentProject = "" } = {}) {
      currentPromptForContext = prompt;
      const contextMode = nextTurnContextMode;
      currentTurnContextMode = contextMode;
      nextTurnContextMode = "rebuild";
      lifecycle.clearPendingAction();
      const turnStartedAt = Date.now();
      const codexTransportStatsBefore = getCodexTransportDebugSnapshot(sessionBinding.get());
      const turnLog = beginLoggedTurn({ logger, engine, modelId, provider, contextMode, userMessage, userRecallHints, startedAt: turnStartedAt }); currentTurnId = turnLog.turnId;
      try {
        const result = await runRunnerTurn({
          prompt, userMessage, options: { userRecallHints, currentProject },
          sessionBinding, engine, ui: runtimeUi, projectMarchDir, memoryStore,
          setModelCallKind: (kind) => { currentModelCallKind = kind; },
          logger: turnLog.logger,
          setPhase: turnLog.setPhase,
          syncCurrentPiSidecar,
          autoNameSession,
          contextMode,
          recordHistory: (turn) => appendRunnerTurnHistory({ store: historyStore, turn, sessionStats: getRunnerSessionStats(sessionBinding.get(), runtimeHost), modelId: engine.modelId, provider: engine.provider }),
        });
        notifyTurnEndDetached(turnNotifier, {
          status: "success",
          sessionName: engine.sessionName,
          draft: result?.draft ?? "",
          durationMs: Date.now() - turnStartedAt,
          activation: buildNotificationActivation({ notificationContext, sessionStats: getRunnerSessionStats(sessionBinding.get(), runtimeHost) }),
        }, (notificationResult) => { lastNotificationResult = notificationResult; });
        const lifecycleAction = lifecycle.takePendingAction();
        if (lifecycleAction) result.lifecycleAction = lifecycleAction;
        turnLog.endSuccess(result);
        return result;
      } catch (err) {
        notifyTurnEndDetached(turnNotifier, {
          status: "error",
          sessionName: engine.sessionName,
          errorMessage: err?.message ?? String(err),
          durationMs: Date.now() - turnStartedAt,
          activation: buildNotificationActivation({ notificationContext, sessionStats: getRunnerSessionStats(sessionBinding.get(), runtimeHost) }),
        }, (notificationResult) => { lastNotificationResult = notificationResult; });
        turnLog.endError(err);
        throw err;
      } finally {
        dumpCodexTransportDebug({ before: codexTransportStatsBefore, session: sessionBinding.get(), ui: runtimeUi, logger });
        currentTurnId = null;
        currentTurnContextMode = "rebuild";
      }
    },
    abort() {
      const activeSession = sessionBinding.get();
      activeSession.abortRetry?.();
      const result = activeSession.abort();
      nextTurnContextMode = "continueExistingPiTranscript";
      return result;
    },
    async cycleModel() {
      const result = await sessionBinding.get().cycleModel();
      _currentFastEntry = null;
      if (result?.model) {
        engine.setRuntimeState({
          modelId: result.model.id, provider: result.model.provider,
          thinkingLevel: result.thinkingLevel,
        });
      }
      return result;
    },
    getCurrentModel() { return _currentFastEntry ?? sessionBinding.get().model; },
    ...providerQuotaRuntime,
    async setModel(model) {
      const activeSession = sessionBinding.get();
      const { baseId, isFast } = fromFastEntryModel(model);
      const baseEntry = sessionBinding.get().scopedModels.find((e) => e.model.id === baseId);
      if (!baseEntry) throw new Error(`Model not found: ${baseId}`);
      await activeSession.setModel(baseEntry.model);
      _currentFastEntry = isFast ? model : null;
      engine.setRuntimeState({
        modelId: activeSession.model?.id ?? baseId,
        provider: activeSession.model?.provider ?? model.provider,
        thinkingLevel: activeSession.thinkingLevel,
      });
      return model;
    },
    getScopedModels() { return appendFastVariants(sessionBinding.get().scopedModels); },
    getConfiguredProviders() { return [...new Set([...Object.values(providers ?? {}).map((profile) => profile?.type).filter(Boolean), ...(modelRegistry.getAvailable?.() ?? []).map((model) => model.provider)])]; },
    getSessionStats() { return getRunnerSessionStats(sessionBinding.get(), runtimeHost); },
    getLastNotificationResult() { return lastNotificationResult; },
    async notifyTest({ title = "March", message = "If you see this, March runtime notifications work." } = {}) {
      lastNotificationResult = await notifyTurnEndBestEffort(turnNotifier, { status: "success", sessionName: engine.sessionName, title, message, durationMs: 0 });
      return lastNotificationResult;
    },
    estimateContextTokens(userMessage = "") {
      return estimateProviderPayloadTokens(providerContextToPayload(engine.buildProviderContext(userMessage)));
    },
    setSessionName(name) {
      const activeSession = sessionBinding.get();
      activeSession.setSessionName?.(name);
      engine.setSessionName(name);
      syncCurrentPiSidecar();
      return engine.sessionName;
    },
    canSwitchPiSession() { return Boolean(runtimeHost); },
    async startNewSession() {
      if (!runtimeHost) throw new Error("pi runtime host is not enabled");
      nextTurnContextMode = "rebuild";
      syncCurrentPiSidecar();
      const result = await runtimeHost.newSession();
      if (result?.cancelled) return { cancelled: true };
      engine.restoreSession({}, [], { replace: true });
      shellRuntime?.killAll?.();
      const stats = getRunnerSessionStats(sessionBinding.get(), runtimeHost);
      return { sessionId: stats.sessionId, sessionFile: stats.sessionFile };
    },
    getExtensionDiagnostics() { return runtimeHost?.getDiagnostics?.() ?? []; },
    getExtensionLifecycleState() { return lifecycleAdapter.getState(); },
    getLspStatus() { return lspService.snapshot(); },
    async switchPiSession(sessionPath, restoreState = null) {
      if (!runtimeHost) throw new Error("pi runtime host is not enabled");
      nextTurnContextMode = "rebuild";
      const result = await runtimeHost.switchSession(sessionPath);
      if (!result?.cancelled && restoreState) engine.restoreSession(restoreState, null, { replace: true });
      return result;
    },
    cycleThinkingLevel() {
      const level = sessionBinding.get().cycleThinkingLevel();
      engine.setRuntimeState({ thinkingLevel: level });
      return level;
    },
    getThinkingLevel() { return sessionBinding.get().thinkingLevel; },
    setThinkingLevel(level) {
      const activeSession = sessionBinding.get();
      activeSession.setThinkingLevel(level);
      engine.setRuntimeState({ thinkingLevel: activeSession.thinkingLevel });
      return activeSession.thinkingLevel;
    },
    getAvailableThinkingLevels() { return sessionBinding.get().getAvailableThinkingLevels(); },
    async dispose() {
      await runRunnerCleanup([
        () => runtimeHost?.dispose() ?? sessionBinding.get().dispose(),
        () => shellRuntime?.dispose?.() ?? shellRuntime?.killAll?.(),
        () => lspService.dispose(),
        () => mcpClientManager?.disconnectAll?.(),
        () => providerQuotaRuntime.disposeProviderQuotaRuntime(),
        () => detachRuntimeUi(),
      ]);
    },
  };
  return runner;
  function syncCurrentPiSidecar() {
    return syncPiSessionSidecar({
      enabled: syncPiSidecar, projectMarchDir, engine,
      sessionStats: getRunnerSessionStats(sessionBinding.get(), runtimeHost),
    });
  }
  function autoNameSession() {
    return maybeAutoNameSession({
      engine,
      session: sessionBinding.get(),
      setSessionName: (name) => {
        const activeSession = sessionBinding.get();
        activeSession.setSessionName?.(name);
        engine.setSessionName(name);
        return engine.sessionName;
      },
    });
  }
  function onLoggedModelPayload(event) {
    logger?.event("model.payload", {
      kind: event.kind,
      provider: event.model?.provider,
      model: event.model?.id,
      estimatedTokens: event.estimatedTokens,
      turnId: currentTurnId,
    });
    onModelPayload?.(event);
  }
  function injectMarchSystemContext(payload, { kind, model } = {}) {
    if (kind !== "user") return payload;
    let nextPayload = currentTurnContextMode === "continueExistingPiTranscript"
      ? payload
      : replaceProviderContextMessages(payload, engine.buildProviderContext(currentPromptForContext));
    nextPayload = injectHostedTools(nextPayload, model, hostedTools);
    nextPayload = applyCodexLargeContextGuardToPayload(nextPayload, { model, session: sessionBinding.get() });
    if (_currentFastEntry) nextPayload = { ...nextPayload, service_tier: "priority" };
    return nextPayload;
  }
}
