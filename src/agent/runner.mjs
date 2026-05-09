import { getModel } from "@mariozechner/pi-ai";
import {
  AuthStorage,
  createAgentSession,
  ModelRegistry,
  SessionManager,
  SettingsManager,
} from "@mariozechner/pi-coding-agent";
import { ContextEngine } from "../context/engine.mjs";
import { createMarchCustomTools } from "./tools.mjs";

export const MARCH_BASE_TOOL_NAMES = ["read", "bash", "edit", "write", "grep", "find", "ls"];

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

export async function createRunner({ cwd, modelId, provider = "deepseek", stateRoot, ui, skills, skillPool = [], pins, graph = null, glossary = null, memoryTools = [], skillTools = [], namespace = "", sessionManager = null }) {
  const authStorage = AuthStorage.create();
  authStorage.setRuntimeApiKey(provider, resolveApiKey(provider));

  const modelRegistry = ModelRegistry.create(authStorage);
  const model = modelRegistry.find(provider, modelId) ?? getModel(provider, modelId);
  if (!model) throw new Error(`Model not found: ${provider}/${modelId}`);

  const settingsManager = SettingsManager.inMemory({
    compaction: { enabled: true, reserveTokens: 262144, keepRecentTokens: 32768 },
    retry: { enabled: true, maxRetries: 3, baseDelayMs: 2000 },
  });

  const engine = new ContextEngine({ cwd, modelId, provider, skills, skillPool, pins, graph, glossary, namespace });

  const customTools = createMarchCustomTools({ cwd, engine, ui, memoryTools, skillTools });

  const activeToolNames = [...MARCH_BASE_TOOL_NAMES, ...customTools.map((tool) => tool.name)];

  const { session } = await createAgentSession({
    cwd,
    agentDir: stateRoot,
    model,
    thinkingLevel: "medium",
    authStorage,
    modelRegistry,
    customTools,
    tools: activeToolNames,
    sessionManager: resolveRunnerSessionManager(cwd, sessionManager),
    settingsManager,
  });

  engine.setToolDefs(session.getActiveToolNames().map((name) => {
    const tool = session.getToolDefinition(name);
    return {
      name,
      description: tool?.description ?? "",
      parameters: tool?.parameters ? describeParams(tool.parameters) : null,
    };
  }));

  return {
    engine,
    session,

    async runTurn(prompt, userMessage) {
      let draft = "";
      let summaryDraft = "";
      let thinkingText = "";
      let summarizing = false;
      ui.turnStart();

      const unsubscribe = session.subscribe((event) => {
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
        await session.prompt(prompt);

        // Post-turn: inject summary prompt with tools + thinking stripped
        summarizing = true;
        ui.summaryStart();

        const originalTools = session.getActiveToolNames();
        const originalThinking = session.thinkingLevel;
        session.setActiveToolsByName([]);
        session.setThinkingLevel("off");

        try {
          await session.prompt(
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

        session.setActiveToolsByName(originalTools);
        session.setThinkingLevel(originalThinking);
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
      session.abortRetry?.();
      return session.abort();
    },

    async cycleModel() {
      return session.cycleModel();
    },

    getCurrentModel() {
      return session.model;
    },

    async setModel(model) {
      await session.setModel(model);
      return session.model;
    },

    getScopedModels() {
      return session.scopedModels;
    },

    async compact() {
      return session.compact();
    },

    getSessionStats() {
      const stats = session.getSessionStats();
      const manager = session.sessionManager;
      return {
        ...stats,
        persisted: manager?.isPersisted?.() ?? Boolean(session.sessionFile),
        sessionFile: manager?.getSessionFile?.() ?? session.sessionFile,
      };
    },

    cycleThinkingLevel() {
      return session.cycleThinkingLevel();
    },

    getThinkingLevel() {
      return session.thinkingLevel;
    },

    setThinkingLevel(level) {
      session.setThinkingLevel(level);
      return session.thinkingLevel;
    },

    getAvailableThinkingLevels() {
      return session.getAvailableThinkingLevels();
    },

    dispose() {
      session.dispose();
    },
  };
}

function describeParams(schema) {
  if (!schema || !schema.properties) return {};
  const out = {};
  for (const [key, prop] of Object.entries(schema.properties)) {
    out[key] = prop.description ?? key;
  }
  return out;
}
