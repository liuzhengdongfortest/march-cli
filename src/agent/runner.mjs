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

export async function createRunner({ cwd, modelId, stateRoot, ui }) {
  const authStorage = AuthStorage.create();
  authStorage.setRuntimeApiKey("deepseek", process.env.DEEPSEEK_API_KEY);

  const modelRegistry = ModelRegistry.create(authStorage);
  const model = modelRegistry.find("deepseek", modelId) ?? getModel("deepseek", modelId);
  if (!model) throw new Error(`Model not found: deepseek/${modelId}`);

  const settingsManager = SettingsManager.inMemory({
    compaction: { enabled: false },
    retry: { enabled: true, maxRetries: 1 },
  });

  const customTools = [
    defineTool({
      name: "send_turn_summary",
      label: "Send Turn Summary",
      description:
        "Record a summary of what you accomplished this turn. Call exactly once at the end of each turn.",
      parameters: Type.Object({
        summary: Type.String({ description: "Concise summary of what was done this turn" }),
      }),
      execute: async (_toolCallId, params) => {
        return {
          content: [{ type: "text", text: `Turn summary recorded: ${params.summary}` }],
          details: { summary: params.summary },
        };
      },
    }),
  ];

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
    session,
    async runTurn(prompt) {
      let draft = "";

      const unsubscribe = session.subscribe((event) => {
        if (event.type === "message_update" && event.assistantMessageEvent?.type === "text_delta") {
          const delta = event.assistantMessageEvent.delta;
          draft += delta;
          ui.textDelta(delta);
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
        return { draft };
      } finally {
        unsubscribe();
      }
    },
    dispose() {
      session.dispose();
    },
  };
}
