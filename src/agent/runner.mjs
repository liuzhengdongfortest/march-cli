import {
  createAgentSession,
  ModelRegistry,
  SettingsManager,
} from "@mariozechner/pi-coding-agent";
import { createMarchAuthStorage } from "../auth/storage.mjs";
import { ContextEngine } from "../context/engine.mjs";
import { createMarchLifecycleAdapter } from "../extensions/lifecycle-adapter.mjs";
import { syncPiSessionSidecar } from "../session/sidecar-sync.mjs";
import { LspService } from "../lsp/service.mjs";
import { formatRecallHints } from "../memory/markdown-store.mjs";
import { appendProviderUserMessage, installModelPayloadDumper, replaceProviderContextMessages } from "./model-payload-dumper.mjs";
import { cloneCurrentPiSession } from "./pi-session/pi-session-clone.mjs";
import { forkPiSessionWithResetContext } from "./pi-session/pi-session-fork-reset.mjs";
import { resolveInitialModel, resolveRunnerSessionManager } from "./runner/runner-init.mjs";
import { runRunnerCleanup } from "./runner/runner-cleanup.mjs";
import { createRunnerRuntimeHost } from "./runtime/runner-runtime-host.mjs";
import { getRunnerSessionStats, syncEngineSessionState } from "./runner/runner-session-state.mjs";
import { resolveRunnerSessionOptions } from "./session/session-options.mjs";
import { createSessionBinding } from "./session/session-binding.mjs";
import { MARCH_BASE_TOOL_NAMES } from "./tool-names.mjs";
import { runRunnerTurn } from "./turn/turn-runner.mjs";

export { MARCH_BASE_TOOL_NAMES };
export { installModelPayloadDumper } from "./model-payload-dumper.mjs";
export { createDefaultSessionManager, resolveRunnerSessionManager } from "./runner/runner-init.mjs";
export { getRunnerSessionStats, syncEngineSessionState } from "./runner/runner-session-state.mjs";

export async function createRunner({ cwd, modelId = null, provider = null, providers = {}, stateRoot, ui, memoryStore = null, memoryTools = [], shellRuntime = null, mcpTools = [], mcpInjections = [], mcpClientManager = null, webTools = [], namespace = "", sessionManager = null, useRuntimeHost = false, projectMarchDir = null, syncPiSidecar = false, extensionPaths = [], lifecycleHooks = [], lifecycleDiagnostics = [], authStorage = null, permissionController = null, modelContextDumper = null, onModelPayload = null, createAgentSessionImpl = createAgentSession, createAgentSessionRuntimeImpl, createRuntimeServices, createRuntimeSessionFromServices, maxTurns, trimBatch }) {
  if (!useRuntimeHost && extensionPaths.length > 0) {
    throw new Error("--extension requires the default pi runtime host path");
  }

  const authConfig = authStorage
    ? { authStorage, hasAuth: true }
    : createMarchAuthStorage({ provider: provider ?? "deepseek", providers, cwd });
  if (!authConfig.hasAuth) throw new Error("No providers configured. Run: march provider --config");
  const resolvedAuth = authConfig.authStorage;

  const modelRegistry = ModelRegistry.create(resolvedAuth);
  const selectedModel = resolveInitialModel({ modelRegistry, provider, modelId });
  if (!selectedModel) throw new Error("No authenticated models available. Run: march provider --config");
  provider = selectedModel.provider;
  modelId = selectedModel.id;
  const settingsManager = SettingsManager.inMemory({
    compaction: { enabled: false },
    retry: { enabled: true, maxRetries: 3, baseDelayMs: 2000 },
  });

  const lspService = new LspService({ cwd });
  const engine = new ContextEngine({ cwd, modelId, provider, namespace, shellRuntime, lspService, injections: mcpInjections, maxTurns, trimBatch });
  const resolvedSessionManager = resolveRunnerSessionManager(cwd, sessionManager);
  const sessionBinding = createSessionBinding(null);
  let currentModelCallKind = "model";
  let currentPromptForContext = "";
  let pendingMidTurnRecallHints = [];
  let runtimeHost = null;
  let lifecycleAdapter = null;

  if (useRuntimeHost) {
    runtimeHost = await createRunnerRuntimeHost({
      cwd,
      stateRoot,
      provider,
      modelId,
      authStorage: resolvedAuth,
      settingsManager,
      modelRegistry,
      sessionManager: resolvedSessionManager,
      sessionBinding,
      engine,
      ui,
      memoryTools,
      memoryStore,
      shellRuntime,
      lspService,
      mcpTools,
      webTools,
      permissionController,
      extensionPaths,
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
      cwd,
      provider,
      modelId,
      modelRegistry,
      engine,
      ui,
      memoryTools,
      shellRuntime,
      lspService,
      mcpTools,
      webTools,
      permissionController,
    });
    const { session } = await createAgentSessionImpl({
      cwd,
      agentDir: stateRoot,
      ...sessionOptions,
      authStorage: resolvedAuth,
      modelRegistry,
      sessionManager: resolvedSessionManager,
      settingsManager,
    });
    sessionBinding.set(session);
    installModelPayloadDumper(session, modelContextDumper, () => currentModelCallKind, onModelPayload, injectMarchSystemContext);
  }

  syncEngineSessionState(engine, sessionBinding.get());
  lifecycleAdapter = createMarchLifecycleAdapter({
    cwd,
    projectMarchDir,
    extensionPaths,
    sessionBinding,
    engine,
    getSessionStats: () => getRunnerSessionStats(sessionBinding.get(), runtimeHost),
    getRuntimeDiagnostics: () => runtimeHost?.getDiagnostics?.() ?? [],
    manifestHooks: lifecycleHooks,
    manifestDiagnostics: lifecycleDiagnostics,
  });

  return {
    engine,
    get session() {
      return sessionBinding.get();
    },
    shellRuntime,

    async runTurn(prompt, userMessage, { userRecallHints = [], currentProject = "" } = {}) {
      currentPromptForContext = prompt;
      pendingMidTurnRecallHints = [];
      return runRunnerTurn({
        prompt,
        userMessage,
        options: { userRecallHints, currentProject },
        sessionBinding,
        engine,
        ui,
        projectMarchDir,
        memoryStore,
        setModelCallKind: (kind) => { currentModelCallKind = kind; },
        onMidTurnRecallHints: (hints) => { pendingMidTurnRecallHints.push(...hints); },
        syncCurrentPiSidecar,
      });
    },

    abort() {
      const activeSession = sessionBinding.get();
      activeSession.abortRetry?.();
      return activeSession.abort();
    },

    async cycleModel() {
      const result = await sessionBinding.get().cycleModel();
      if (result?.model) {
        engine.setRuntimeState({
          modelId: result.model.id,
          provider: result.model.provider,
          thinkingLevel: result.thinkingLevel,
        });
      }
      return result;
    },
    getCurrentModel() {
      return sessionBinding.get().model;
    },

    async setModel(model) {
      const activeSession = sessionBinding.get();
      await activeSession.setModel(model);
      engine.setRuntimeState({
        modelId: activeSession.model?.id ?? model.id,
        provider: activeSession.model?.provider ?? model.provider,
        thinkingLevel: activeSession.thinkingLevel,
      });
      return activeSession.model;
    },
    getScopedModels() {
      return sessionBinding.get().scopedModels;
    },

    getConfiguredProviders() {
      const configured = Object.values(providers ?? {}).map((profile) => profile?.type).filter(Boolean);
      const available = (modelRegistry.getAvailable?.() ?? []).map((model) => model.provider);
      return [...new Set([...configured, ...available])];
    },
    getSessionStats() {
      return getRunnerSessionStats(sessionBinding.get(), runtimeHost);
    },
    setSessionName(name) {
      engine.setSessionName(name);
      syncCurrentPiSidecar();
      return engine.sessionName;
    },
    canSwitchPiSession() {
      return Boolean(runtimeHost);
    },
    async startNewSession() {
      if (!runtimeHost) throw new Error("pi runtime host is not enabled");
      syncCurrentPiSidecar();
      const result = await runtimeHost.newSession();
      if (result?.cancelled) return { cancelled: true };
      engine.restoreSession({}, [], { replace: true });
      shellRuntime?.killAll?.();
      const stats = getRunnerSessionStats(sessionBinding.get(), runtimeHost);
      return { sessionId: stats.sessionId, sessionFile: stats.sessionFile };
    },
    getExtensionDiagnostics() {
      return runtimeHost?.getDiagnostics?.() ?? [];
    },
    getExtensionLifecycleState() {
      return lifecycleAdapter.getState();
    },
    async switchPiSession(sessionPath) {
      if (!runtimeHost) throw new Error("pi runtime host is not enabled");
      return runtimeHost.switchSession(sessionPath);
    },
    async clonePiSession() {
      return cloneCurrentPiSession({
        runtimeHost,
        sessionBinding,
        engine,
        projectMarchDir,
        getSessionStats: getRunnerSessionStats,
      });
    },
    getPiForkCandidates() {
      if (!runtimeHost) throw new Error("pi runtime host is not enabled");
      return sessionBinding.get().getUserMessagesForForking();
    },

    async forkPiSessionWithResetContext(entryId) {
      return forkPiSessionWithResetContext({
        runtimeHost,
        sessionBinding,
        engine,
        projectMarchDir,
        entryId,
        getSessionStats: getRunnerSessionStats,
      });
    },
    cycleThinkingLevel() {
      const level = sessionBinding.get().cycleThinkingLevel();
      engine.setRuntimeState({ thinkingLevel: level });
      return level;
    },
    getThinkingLevel() {
      return sessionBinding.get().thinkingLevel;
    },
    setThinkingLevel(level) {
      const activeSession = sessionBinding.get();
      activeSession.setThinkingLevel(level);
      engine.setRuntimeState({ thinkingLevel: activeSession.thinkingLevel });
      return activeSession.thinkingLevel;
    },

    getAvailableThinkingLevels() {
      return sessionBinding.get().getAvailableThinkingLevels();
    },

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
      enabled: syncPiSidecar,
      projectMarchDir,
      engine,
      sessionStats: getRunnerSessionStats(sessionBinding.get(), runtimeHost),
    });
  }

  function injectMarchSystemContext(payload, { kind } = {}) {
    if (kind !== "user") return payload;
    let nextPayload = replaceProviderContextMessages(payload, engine.buildProviderContext(currentPromptForContext));
    if (pendingMidTurnRecallHints.length > 0) {
      nextPayload = appendProviderUserMessage(nextPayload, formatRecallHints("assistant", pendingMidTurnRecallHints));
      pendingMidTurnRecallHints = [];
    }
    return nextPayload;
  }
}
