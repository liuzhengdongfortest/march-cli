import {
  AuthStorage,
  createAgentSession,
  ModelRegistry,
  SessionManager,
  SettingsManager,
} from "@mariozechner/pi-coding-agent";
import { ContextEngine } from "../context/engine.mjs";
import { createRunnerRuntimeHost } from "./runner-runtime-host.mjs";
import { resolveRunnerSessionOptions } from "./session-options.mjs";
import { createSessionBinding } from "./session-binding.mjs";
import { MARCH_BASE_TOOL_NAMES } from "./tool-names.mjs";

export { MARCH_BASE_TOOL_NAMES };

export function createDefaultSessionManager(cwd) {
  return SessionManager.inMemory(cwd);
}

export function resolveRunnerSessionManager(cwd, sessionManager = null) {
  return sessionManager ?? createDefaultSessionManager(cwd);
}

function resolveApiKey(provider) {
  const envMap = {
    deepseek: "DEEPSEEK_API_KEY",
    openai: "OPENAI_API_KEY",
    anthropic: "ANTHROPIC_API_KEY",
  };
  const envVar = envMap[provider] ?? `${provider.toUpperCase()}_API_KEY`;
  const key = process.env[envVar];
  if (!key) throw new Error(`${envVar} environment variable is not set.`);
  return key;
}

export async function createRunner({ cwd, modelId, provider = "deepseek", stateRoot, ui, skills, skillPool = [], pins, graph = null, glossary = null, memoryTools = [], skillTools = [], namespace = "", sessionManager = null, useRuntimeHost = false }) {
  const authStorage = AuthStorage.create();
  authStorage.setRuntimeApiKey(provider, resolveApiKey(provider));

  const modelRegistry = ModelRegistry.create(authStorage);
  const settingsManager = SettingsManager.inMemory({
    compaction: { enabled: true, reserveTokens: 262144, keepRecentTokens: 32768 },
    retry: { enabled: true, maxRetries: 3, baseDelayMs: 2000 },
  });

  const engine = new ContextEngine({ cwd, modelId, provider, skills, skillPool, pins, graph, glossary, namespace });
  const resolvedSessionManager = resolveRunnerSessionManager(cwd, sessionManager);
  const sessionBinding = createSessionBinding(null);
  let runtimeHost = null;

  if (useRuntimeHost) {
    runtimeHost = await createRunnerRuntimeHost({
      cwd,
      stateRoot,
      provider,
      modelId,
      authStorage,
      settingsManager,
      modelRegistry,
      sessionManager: resolvedSessionManager,
      sessionBinding,
      engine,
      ui,
      memoryTools,
      skillTools,
      onRebind: (session) => bindToolDefs(engine, session),
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
      skillTools,
    });
    const { session } = await createAgentSession({
      cwd,
      agentDir: stateRoot,
      ...sessionOptions,
      authStorage,
      modelRegistry,
      sessionManager: resolvedSessionManager,
      settingsManager,
    });
    sessionBinding.set(session);
  }

  bindToolDefs(engine, sessionBinding.get());

  return {
    engine,
    get session() {
      return sessionBinding.get();
    },

    async runTurn(prompt, userMessage) {
      const activeSession = sessionBinding.get();
      let draft = "";
      let summaryDraft = "";
      let thinkingText = "";
      let summarizing = false;
      ui.turnStart();

      const unsubscribe = activeSession.subscribe((event) => {
        if (event.type === "message_update" && event.assistantMessageEvent) {
          const ae = event.assistantMessageEvent;
          if (ae.type === "text_delta") {
            if (summarizing) {
              summaryDraft += ae.delta;
            } else {
              draft += ae.delta;
              ui.textDelta(ae.delta);
            }
          }
          if (ae.type === "thinking_start" && !summarizing) {
            thinkingText = "";
            ui.thinkingStart();
          }
          if (ae.type === "thinking_delta" && !summarizing) {
            thinkingText += ae.delta;
            ui.thinkingDelta(ae.delta);
          }
          if (ae.type === "thinking_end" && !summarizing && thinkingText) {
            const tokens = Math.round(thinkingText.length / 4);
            ui.thinkingEnd(tokens);
            thinkingText = "";
          }
        }
        if (event.type === "tool_execution_start") {
          if (!summarizing) ui.toolStart(event.toolName, event.args);
        }
        if (event.type === "tool_execution_end") {
          if (!summarizing) ui.toolEnd(event.toolName, event.isError, event.result);
        }
        if (event.type === "compaction_end" && !event.aborted && event.result?.summary) {
          engine.recordCompaction(event.result.summary);
        }
        if (event.type === "auto_retry_start" && !summarizing) {
          ui.retryStart?.({
            attempt: event.attempt,
            maxAttempts: event.maxAttempts,
            delayMs: event.delayMs,
            errorMessage: event.errorMessage,
          });
        }
        if (event.type === "auto_retry_end" && !summarizing) {
          ui.retryEnd?.({
            success: event.success,
            attempt: event.attempt,
            finalError: event.finalError,
          });
        }
      });

      try {
        await activeSession.prompt(prompt);

        // Post-turn: inject summary prompt with tools + thinking stripped
        summarizing = true;
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
          if (!summaryDraft) {
            summaryDraft = draft.slice(0, 300) || "(no output)";
          }
        }

        activeSession.setActiveToolsByName(originalTools);
        activeSession.setThinkingLevel(originalThinking);
        ui.summaryDone();

        const summary = (summaryDraft || "(no summary)").slice(0, 4000);

        engine.recordTurn({
          userMessage: userMessage ?? prompt.slice(0, 300),
          summary,
          assistantMessage: draft,
        });

        return { draft, summary };
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
      return sessionBinding.get().cycleModel();
    },

    getCurrentModel() {
      return sessionBinding.get().model;
    },

    async setModel(model) {
      const activeSession = sessionBinding.get();
      await activeSession.setModel(model);
      return activeSession.model;
    },

    getScopedModels() {
      return sessionBinding.get().scopedModels;
    },

    async compact() {
      return sessionBinding.get().compact();
    },

    getSessionStats() {
      const activeSession = sessionBinding.get();
      const stats = activeSession.getSessionStats();
      const manager = activeSession.sessionManager;
      return {
        ...stats,
        persisted: manager?.isPersisted?.() ?? Boolean(activeSession.sessionFile),
        sessionFile: manager?.getSessionFile?.() ?? activeSession.sessionFile,
      };
    },

    cycleThinkingLevel() {
      return sessionBinding.get().cycleThinkingLevel();
    },

    getThinkingLevel() {
      return sessionBinding.get().thinkingLevel;
    },

    setThinkingLevel(level) {
      const activeSession = sessionBinding.get();
      activeSession.setThinkingLevel(level);
      return activeSession.thinkingLevel;
    },

    getAvailableThinkingLevels() {
      return sessionBinding.get().getAvailableThinkingLevels();
    },

    dispose() {
      return runtimeHost?.dispose() ?? sessionBinding.get().dispose();
    },
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

function describeParams(schema) {
  if (!schema || !schema.properties) return {};
  const out = {};
  for (const [key, prop] of Object.entries(schema.properties)) {
    out[key] = prop.description ?? key;
  }
  return out;
}
