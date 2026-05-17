import {
  createAgentSession,
  ModelRegistry,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { createMarchAuthStorage } from "../auth/storage.mjs";
import { ContextEngine } from "../context/engine.mjs";
import { createMarchLifecycleAdapter } from "../extensions/lifecycle-adapter.mjs";
import { syncPiSessionSidecar } from "../session/sidecar-sync.mjs";
import { LspService } from "../lsp/service.mjs";
import { formatRecallHints } from "../memory/markdown-store.mjs";
import { appendProviderUserMessage, estimateProviderPayloadTokens, installModelPayloadDumper, replaceProviderContextMessages } from "./model-payload-dumper.mjs";
import { resolveInitialModel, resolveRunnerSessionManager } from "./runner/runner-init.mjs";
import { runRunnerCleanup } from "./runner/runner-cleanup.mjs";
import { createRunnerRuntimeHost } from "./runtime/runner-runtime-host.mjs";
import { getRunnerSessionStats, syncEngineSessionState } from "./runner/runner-session-state.mjs";
import { resolveRunnerSessionOptions } from "./session/session-options.mjs";
import { createSessionBinding } from "./session/session-binding.mjs";
import { maybeAutoNameSession } from "./session/session-auto-name.mjs";
import { MARCH_BASE_TOOL_NAMES } from "./tool-names.mjs";
import { runRunnerTurn } from "./turn/turn-runner.mjs";
import { appendFastVariants, createFastModelEntry, fromFastEntryModel, isFastProvider } from "./runner/fast-model.mjs";
import { registerSuperGrokProvider } from "../supergrok/provider.mjs";
import { registerCustomProviders } from "../provider/custom-provider.mjs";

export { MARCH_BASE_TOOL_NAMES };
export { installModelPayloadDumper } from "./model-payload-dumper.mjs";
export { createDefaultSessionManager, resolveRunnerSessionManager } from "./runner/runner-init.mjs";
export { getRunnerSessionStats, syncEngineSessionState } from "./runner/runner-session-state.mjs";

export async function createRunner({ cwd, modelId = null, provider = null, providers = {}, stateRoot, ui, memoryRoot = null, centerMemoryPath = null, memoryStore = null, memoryTools = [], shellRuntime = null, mcpTools = [], mcpInjections = [], mcpClientManager = null, webTools = [], namespace = "", sessionManager = null, useRuntimeHost = false, projectMarchDir = null, syncPiSidecar = false, extensionPaths = [], lifecycleHooks = [], lifecycleDiagnostics = [], authStorage = null, permissionController = null, modelContextDumper = null, turnNotifier = null, onModelPayload = null, createAgentSessionImpl = createAgentSession, createAgentSessionRuntimeImpl, createRuntimeServices, createRuntimeSessionFromServices, maxTurns, trimBatch, serviceTier = null }) {
  if (!useRuntimeHost && extensionPaths.length > 0) {
    throw new Error("--extension requires the default pi runtime host path");
  }
  const authConfig = authStorage
    ? { authStorage, hasAuth: true }
    : createMarchAuthStorage({ provider: provider ?? "deepseek", providers, cwd });
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
  const lspService = new LspService({ cwd });
  const engine = new ContextEngine({ cwd, modelId, provider, namespace, memoryRoot, centerMemoryPath, shellRuntime, lspService, injections: mcpInjections, maxTurns, trimBatch });
  const resolvedSessionManager = resolveRunnerSessionManager(cwd, sessionManager);
  const sessionBinding = createSessionBinding(null);
  let currentModelCallKind = "model";
  let currentPromptForContext = "";
  let currentTurnContextMode = "rebuild";
  let nextTurnContextMode = "rebuild";
  let pendingMidTurnRecallHints = [];
  let lastNotificationResult = null;
  let runtimeHost = null;
  let lifecycleAdapter = null;
  let _currentFastEntry = null;
  if (useRuntimeHost) {
    runtimeHost = await createRunnerRuntimeHost({
      cwd, stateRoot, provider, modelId,
      authStorage: resolvedAuth, settingsManager, modelRegistry,
      providers,
      sessionManager: resolvedSessionManager, sessionBinding, engine, ui,
      projectMarchDir,
      memoryTools, memoryStore, shellRuntime, lspService, mcpTools, webTools,
      permissionController, extensionPaths,
      onRebind: (session) => {
        installModelPayloadDumper(session, modelContextDumper, () => currentModelCallKind, onModelPayload, injectMarchSystemContext);
        syncEngineSessionState(engine, session);
      },
      createAgentSessionRuntimeImpl,
      createServices: createRuntimeServices,
      createFromServices: createRuntimeSessionFromServices,
    });
  } else {
    const sessionOptions = resolveRunnerSessionOptions({
      cwd, provider, modelId, modelRegistry, engine, ui,
      memoryTools, shellRuntime, lspService, mcpTools, webTools, permissionController,
      authStorage: resolvedAuth, projectMarchDir,
    });
    const { session } = await createAgentSessionImpl({
      cwd, agentDir: stateRoot, ...sessionOptions,
      authStorage: resolvedAuth, modelRegistry,
      sessionManager: resolvedSessionManager, settingsManager,
    });
    sessionBinding.set(session);
    installModelPayloadDumper(session, modelContextDumper, () => currentModelCallKind, onModelPayload, injectMarchSystemContext);
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
  return {
    engine,
    get session() { return sessionBinding.get(); },
    shellRuntime,
    async runTurn(prompt, userMessage, { userRecallHints = [], currentProject = "" } = {}) {
      currentPromptForContext = prompt;
      const contextMode = nextTurnContextMode;
      currentTurnContextMode = contextMode;
      nextTurnContextMode = "rebuild";
      pendingMidTurnRecallHints = [];
      const turnStartedAt = Date.now();
      try {
        const result = await runRunnerTurn({
          prompt, userMessage, options: { userRecallHints, currentProject },
          sessionBinding, engine, ui, projectMarchDir, memoryStore,
          setModelCallKind: (kind) => { currentModelCallKind = kind; },
          onMidTurnRecallHints: (hints) => { pendingMidTurnRecallHints.push(...hints); },
          syncCurrentPiSidecar,
          autoNameSession,
          contextMode,
        });
        lastNotificationResult = await notifyTurnEndBestEffort(turnNotifier, {
          status: "success",
          sessionName: engine.sessionName,
          draft: result?.draft ?? "",
          durationMs: Date.now() - turnStartedAt,
        });
        return result;
      } catch (err) {
        lastNotificationResult = await notifyTurnEndBestEffort(turnNotifier, {
          status: "error",
          sessionName: engine.sessionName,
          errorMessage: err?.message ?? String(err),
          durationMs: Date.now() - turnStartedAt,
        });
        throw err;
      } finally {
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
    getConfiguredProviders() {
      const configured = Object.values(providers ?? {}).map((profile) => profile?.type).filter(Boolean);
      const available = (modelRegistry.getAvailable?.() ?? []).map((model) => model.provider);
      return [...new Set([...configured, ...available])];
    },
    getSessionStats() { return getRunnerSessionStats(sessionBinding.get(), runtimeHost); },
    getLastNotificationResult() { return lastNotificationResult; },
    async notifyTest({ title = "March", message = "If you see this, March runtime notifications work." } = {}) {
      lastNotificationResult = await notifyTurnEndBestEffort(turnNotifier, {
        status: "success",
        sessionName: engine.sessionName,
        title,
        message,
        durationMs: 0,
      });
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
    async switchPiSession(sessionPath) {
      if (!runtimeHost) throw new Error("pi runtime host is not enabled");
      nextTurnContextMode = "rebuild";
      return runtimeHost.switchSession(sessionPath);
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
      ]);
    },
  };
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
  function injectMarchSystemContext(payload, { kind } = {}) {
    if (kind !== "user") return payload;
    let nextPayload = currentTurnContextMode === "continueExistingPiTranscript"
      ? payload
      : replaceProviderContextMessages(payload, engine.buildProviderContext(currentPromptForContext));
    if (_currentFastEntry) nextPayload = { ...nextPayload, service_tier: "priority" };
    if (pendingMidTurnRecallHints.length > 0) {
      nextPayload = appendProviderUserMessage(nextPayload, formatRecallHints("assistant", pendingMidTurnRecallHints));
      pendingMidTurnRecallHints = [];
    }
    return nextPayload;
  }
}

function providerContextToPayload(providerContext) {
  return {
    messages: [
      { role: "system", content: providerContext.system },
      ...(providerContext.userMessages ?? []).map((message) => ({ role: "user", content: message.content })),
    ],
  };
}

async function notifyTurnEndBestEffort(turnNotifier, event) {
  if (!turnNotifier?.notifyTurnEnd) return { ok: false, reason: "not-configured", results: [] };
  try {
    return await turnNotifier.notifyTurnEnd(event);
  } catch (err) {
    // Notification must never change turn behavior.
    return { ok: false, reason: err?.message ?? String(err), results: [] };
  }
}
