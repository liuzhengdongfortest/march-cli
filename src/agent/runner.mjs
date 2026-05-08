import { getModel } from "@mariozechner/pi-ai";
import {
  AuthStorage,
  createAgentSession,
  defineTool,
  ModelRegistry,
  SessionManager,
  SettingsManager,
} from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import { ContextEngine } from "../context/engine.mjs";

export async function createRunner({ cwd, modelId, stateRoot, ui, skills, pins }) {
  const provider = "deepseek";
  const authStorage = AuthStorage.create();
  authStorage.setRuntimeApiKey(provider, process.env.DEEPSEEK_API_KEY);

  const modelRegistry = ModelRegistry.create(authStorage);
  const model = modelRegistry.find(provider, modelId) ?? getModel(provider, modelId);
  if (!model) throw new Error(`Model not found: ${provider}/${modelId}`);

  const settingsManager = SettingsManager.inMemory({
    compaction: { enabled: false },
    retry: { enabled: true, maxRetries: 1 },
  });

  const engine = new ContextEngine({ cwd, modelId, provider, skills, pins });

  // Turn tracking — mutable ref shared with tool execute handlers
  const turnState = { summary: null, summaryCalled: false };

  const summaryTool = defineTool({
    name: "send_turn_summary",
    label: "Send Turn Summary",
    description:
      "MANDATORY at the end of every turn. Record a concise summary of what you accomplished, what decisions were made, and what remains. Your turn is not complete until you call this.",
    parameters: Type.Object({
      summary: Type.String({
        description: "Concise summary of what was accomplished this turn (1-5 sentences)",
      }),
    }),
    execute: async (_toolCallId, params) => {
      turnState.summary = params.summary;
      turnState.summaryCalled = true;
      return {
        content: [{ type: "text", text: "Turn summary recorded." }],
        details: { summary: params.summary },
      };
    },
  });

  const customTools = [summaryTool];

  const { session } = await createAgentSession({
    cwd,
    agentDir: stateRoot,
    model,
    thinkingLevel: "off",
    authStorage,
    modelRegistry,
    customTools,
    sessionManager: SessionManager.inMemory(cwd),
    settingsManager,
  });

  return {
    engine,
    session,

    async runTurn(prompt) {
      turnState.summary = null;
      turnState.summaryCalled = false;
      let draft = "";

      const unsubscribe = session.subscribe((event) => {
        if (event.type === "message_update" && event.assistantMessageEvent?.type === "text_delta") {
          draft += event.assistantMessageEvent.delta;
          ui.textDelta(event.assistantMessageEvent.delta);
        }
        if (event.type === "tool_execution_start") {
          ui.toolStart(event.toolName, event.args);
        }
        if (event.type === "tool_execution_end") {
          ui.toolEnd(event.toolName, event.isError);
        }
      });

      try {
        await session.prompt(prompt);

        // Enforce send_turn_summary
        if (!turnState.summaryCalled) {
          ui.status("send_turn_summary not called — enforcing");
          const enforcePrompt = `[system]
You forgot to call send_turn_summary. Call it NOW with a summary of what you accomplished this turn. Do not do anything else.`;
          try {
            await session.prompt(enforcePrompt);
          } catch {
            // If enforcement fails, record a fallback summary
            if (!turnState.summary) {
              turnState.summary = draft.slice(0, 300) || "(no output)";
            }
          }
        }

        // Record turn
        engine.recordTurn({
          userMessage: prompt,
          summary: turnState.summary ?? "(no summary)",
        });

        return { draft, summary: turnState.summary };
      } finally {
        unsubscribe();
      }
    },

    dispose() {
      session.dispose();
    },
  };
}
