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
import { createRunnerRuntimeHost } from "./runner-runtime-host.mjs";
import { resolveRunnerSessionOptions } from "./session-options.mjs";
import { createSessionBinding } from "./session-binding.mjs";
import { MARCH_BASE_TOOL_NAMES } from "./tool-names.mjs";
import { createTurnEventState, handleRunnerSessionEvent } from "./turn-events.mjs";

export { MARCH_BASE_TOOL_NAMES };

export function createDefaultSessionManager(cwd) {
  return SessionManager.inMemory(cwd);
}

export function resolveRunnerSessionManager(cwd, sessionManager = null) {
  return sessionManager ?? createDefaultSessionManager(cwd);
}

export async function createRunner({ cwd, modelId, provider = "deepseek", stateRoot, ui, skills, skillPool = [], pins, graph = null, glossary = null, memoryTools = [], skillTools = [], shellRuntime = null, namespace = "", sessionManager = null, useRuntimeHost = false, projectMarchDir = null, syncPiSidecar = false, extensionPaths = [], lifecycleHooks = [], lifecycleDiagnostics = [], authStorage = null, createAgentSessionImpl = createAgentSession, createAgentSessionRuntimeImpl, createRuntimeServices, createRuntimeSessionFromServices }) {
  const authConfig = authStorage
    ? { authStorage, hasAuth: true }
    : createMarchAuthStorage({ provider, cwd });
  if (!authConfig.hasAuth) throw new Error(`No credentials configured for ${provider}. Set ${authConfig.apiKeyEnv} or login via pi auth.`);
  const resolvedAuth = authConfig.authStorage;

  const modelRegistry = ModelRegistry.create(resolvedAuth);
  const settingsManager = SettingsManager.inMemory({
    compaction: { enabled: true, reserveTokens: 262144, keepRecentTokens: 32768 },
    retry: { enabled: true, maxRetries: 3, baseDelayMs: 2000 },
  });

  const engine = new ContextEngine({ cwd, modelId, provider, skills, skillPool, pins, graph, glossary, namespace, shellRuntime });
  const resolvedSessionManager = resolveRunnerSessionManager(cwd, sessionManager);
  const sessionBinding = createSessionBinding(null);
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
      skillTools,
      shellRuntime,
      extensionPaths,
      onRebind: (session) => syncEngineSessionState(engine, session),
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

    async runTurn(prompt, userMessage) {
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
        await activeSession.prompt(
          prompt,
          attachmentReferences.images.length > 0 ? { images: attachmentReferences.images } : undefined,
        );

        // Post-turn: inject summary prompt with tools + thinking stripped
        turnState.summarizing = true;
        ui.summaryStart();

        const originalTools = activeSession.getActiveToolNames();
        const originalThinking = activeSession.thinkingLevel;
        activeSession.setActiveToolsByName([]);
        activeSession.setThinkingLevel("off");

        try {
          await activeSession.prompt(
            "[system]\nSummarize the work you just completed in 1-2 paragraphs for the next turn's context. " +
            "Focus on: what was accomplished, what decisions were made, and what's left to do. " +
            "Output ONLY the summary — no tools, no code, just the summary text.\n\n" +
            "Keep it under 1k tokens.",
          );
        } catch {
          if (!turnState.summaryDraft) {
            turnState.summaryDraft = turnState.draft.slice(0, 300) || "(no output)";
          }
        }

        activeSession.setActiveToolsByName(originalTools);
        activeSession.setThinkingLevel(originalThinking);
        ui.summaryDone();

        const summary = (turnState.summaryDraft || "(no summary)").slice(0, 4000);

        engine.recordTurn({
          userMessage: userMessage ?? prompt.slice(0, 300),
          summary,
          assistantMessage: turnState.draft,
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
      const shellCleanup = shellRuntime?.dispose?.() ?? shellRuntime?.killAll?.();
      const sessionCleanup = runtimeHost?.dispose() ?? sessionBinding.get().dispose();
      await sessionCleanup;
      await shellCleanup;
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

function getRunnerSessionStats(activeSession, runtimeHost) {
  const stats = activeSession.getSessionStats();
  const manager = activeSession.sessionManager;
  return {
    ...stats,
    runtimeHost: Boolean(runtimeHost),
    piSessionSwitching: Boolean(runtimeHost),
    persisted: manager?.isPersisted?.() ?? Boolean(activeSession.sessionFile),
    sessionFile: manager?.getSessionFile?.() ?? activeSession.sessionFile,
  };
}

function bindToolDefs(engine, session) {
  engine.setToolDefs(session.getActiveToolNames().map((name) => {
    const tool = session.getToolDefinition(name);
    return {
      name,
      description: tool?.description ?? "",
      parameters: tool?.parameters ? describeParams(tool.parameters) : null,
    };
  }));
}

export function syncEngineSessionState(engine, session) {
  bindToolDefs(engine, session);
  engine.setRuntimeState({
    modelId: session.model?.id,
    provider: session.model?.provider,
    thinkingLevel: session.thinkingLevel,
  });
}

function describeParams(schema) {
  if (!schema || !schema.properties) return {};
  const out = {};
  for (const [key, prop] of Object.entries(schema.properties)) {
    out[key] = prop.description ?? key;
  }
  return out;
}
