import {
  createAgentSession,
  ModelRegistry,
  SessionManager,
  SettingsManager,
} from "@mariozechner/pi-coding-agent";
import { createMarchAuthStorage } from "../auth/storage.mjs";
import { ContextEngine } from "../context/engine.mjs";
import { createMarchLifecycleAdapter } from "../extensions/lifecycle-adapter.mjs";
import { resolveImageAttachmentReferences } from "../session/attachment-references.mjs";
import { syncPiSessionSidecar } from "../session/sidecar-sync.mjs";
import { cloneCurrentPiSession } from "./pi-session-clone.mjs";
import { forkPiSessionWithResetContext } from "./pi-session-fork-reset.mjs";
import { runRunnerCleanup } from "./runner-cleanup.mjs";
import { createRunnerRuntimeHost } from "./runner-runtime-host.mjs";
import { getRunnerSessionStats, syncEngineSessionState } from "./runner-session-state.mjs";
import { resolveRunnerSessionOptions } from "./session-options.mjs";
import { createSessionBinding } from "./session-binding.mjs";
import { MARCH_BASE_TOOL_NAMES } from "./tool-names.mjs";
import { createTurnEventState, handleRunnerSessionEvent } from "./turn-events.mjs";
import { LspService } from "../lsp/service.mjs";

const MODEL_PAYLOAD_DUMPER_INSTALLED = Symbol("march.modelPayloadDumperInstalled");

export { MARCH_BASE_TOOL_NAMES };
export { getRunnerSessionStats, syncEngineSessionState } from "./runner-session-state.mjs";

export function createDefaultSessionManager(cwd) {
  return SessionManager.inMemory(cwd);
}

export function resolveRunnerSessionManager(cwd, sessionManager = null) {
  return sessionManager ?? createDefaultSessionManager(cwd);
}

export async function createRunner({ cwd, modelId = null, provider = null, providers = {}, stateRoot, ui, skills, skillPool = [], pins, memoryStore = null, memoryTools = [], skillTools = [], shellRuntime = null, mcpTools = [], mcpInjections = [], mcpClientManager = null, webTools = [], namespace = "", sessionManager = null, useRuntimeHost = false, projectMarchDir = null, syncPiSidecar = false, extensionPaths = [], lifecycleHooks = [], lifecycleDiagnostics = [], authStorage = null, permissionController = null, modelContextDumper = null, createAgentSessionImpl = createAgentSession, createAgentSessionRuntimeImpl, createRuntimeServices, createRuntimeSessionFromServices }) {
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
    compaction: { enabled: true, reserveTokens: 262144, keepRecentTokens: 32768 },
    retry: { enabled: true, maxRetries: 3, baseDelayMs: 2000 },
  });

  const lspService = new LspService({ cwd });
  const engine = new ContextEngine({ cwd, modelId, provider, skills, skillPool, pins, namespace, shellRuntime, lspService, injections: mcpInjections });
  const resolvedSessionManager = resolveRunnerSessionManager(cwd, sessionManager);
  const sessionBinding = createSessionBinding(null);
  let currentModelCallKind = "model";
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
      skillTools,
      shellRuntime,
      lspService,
      mcpTools,
      webTools,
      permissionController,
      extensionPaths,
      onRebind: (session) => {
        installModelPayloadDumper(session, modelContextDumper, () => currentModelCallKind);
        syncEngineSessionState(engine, session);
      },
      createAgentSessionRuntimeImpl,
      createServices: createRuntimeServices,
      createFromServices: createRuntimeSessionFromServices,
    });
  } else {
    if (extensionPaths.length > 0) {
      throw new Error("--extension requires the default pi runtime host path; remove --legacy-sessions to load extensions");
    }
    const sessionOptions = resolveRunnerSessionOptions({
      cwd,
      provider,
      modelId,
      modelRegistry,
      engine,
      ui,
      memoryTools,
      skillTools,
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
    installModelPayloadDumper(session, modelContextDumper, () => currentModelCallKind);
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
      const activeSession = sessionBinding.get();
      const turnState = createTurnEventState();
      ui.turnStart();

      const unsubscribe = activeSession.subscribe((event) => {
        handleRunnerSessionEvent(event, { ui, engine, state: turnState });
      });

      try {
        const attachmentReferences = resolveImageAttachmentReferences({
          text: userMessage ?? prompt,
          projectMarchDir,
        });
        currentModelCallKind = "user";
        try {
          await activeSession.prompt(
            prompt,
            attachmentReferences.images.length > 0 ? { images: attachmentReferences.images } : undefined,
          );
        } finally {
          currentModelCallKind = "model";
        }

        // Post-turn: inject summary prompt with tools + thinking stripped
        turnState.summarizing = true;
        ui.summaryStart();

        const originalTools = activeSession.getActiveToolNames();
        const originalThinking = activeSession.thinkingLevel;
        activeSession.setActiveToolsByName([]);
        activeSession.setThinkingLevel("off");

        try {
          const summaryPrompt = "[system]\nSummarize the work you just completed in 1-2 paragraphs for the next turn's context. " +
            "Focus on: what was accomplished, what decisions were made, and what's left to do. " +
            "Output ONLY the summary — no tools, no code, just the summary text.\n\n" +
            "Keep it under 1k tokens.";
          currentModelCallKind = "summary";
          try {
            await activeSession.prompt(summaryPrompt);
          } finally {
            currentModelCallKind = "model";
          }
        } catch {
          if (!turnState.summaryDraft) {
            turnState.summaryDraft = turnState.draft.slice(0, 300) || "(no output)";
          }
        }

        activeSession.setActiveToolsByName(originalTools);
        activeSession.setThinkingLevel(originalThinking);
        ui.summaryDone();

        const summary = (turnState.summaryDraft || "(no summary)").slice(0, 4000);
        const assistantRecallHints = memoryStore
          ? memoryStore.recallForAssistant(turnState.draft, { currentProject })
          : [];

        engine.recordTurn({
          userMessage: userMessage ?? prompt.slice(0, 300),
          summary,
          assistantMessage: turnState.draft,
          userRecallHints,
          assistantRecallHints,
        });

        syncCurrentPiSidecar();

        return { draft: turnState.draft, summary };
      } finally {
        ui.turnEnd();
        unsubscribe();
      }
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

    async compact() {
      const result = await sessionBinding.get().compact();
      if (result?.summary) {
        engine.recordCompaction(result.summary);
        syncCurrentPiSidecar();
      }
      return result;
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
        skillPool,
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
}

function resolveInitialModel({ modelRegistry, provider, modelId }) {
  const available = modelRegistry.getAvailable?.() ?? [];
  if (provider && modelId) return available.find((model) => model.provider === provider && model.id === modelId) ?? null;
  return available[0] ?? null;
}

export function installModelPayloadDumper(session, modelContextDumper, getKind = () => "model") {
  if (!modelContextDumper?.enabled || !session?.agent) return;
  const agent = session.agent;
  if (agent[MODEL_PAYLOAD_DUMPER_INSTALLED]) return;
  const originalOnPayload = agent.onPayload;
  agent.onPayload = async (payload, model) => {
    const replacement = originalOnPayload ? await originalOnPayload(payload, model) : undefined;
    const effectivePayload = replacement === undefined ? payload : replacement;
    modelContextDumper.dump({
      kind: getKind(),
      prompt: formatModelPayload(effectivePayload),
      metadata: {
        provider: model?.provider,
        model: model?.id,
        payload: "provider_request",
      },
    });
    return replacement;
  };
  agent[MODEL_PAYLOAD_DUMPER_INSTALLED] = true;
}

function formatModelPayload(payload) {
  if (typeof payload === "string") return payload;
  return JSON.stringify(payload, null, 2);
}
