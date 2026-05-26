import { injectHostedTools } from "../../../provider/hosted-tools.mjs";
import { applyCodexLargeContextGuardToPayload } from "../codex-large-context-guard.mjs";

export function createMarchPiContextExtension({
  engine,
  sessionBinding,
  hostedTools = {},
  getCurrentPrompt,
  getContextMode,
  getFastEntry,
  waitForMidTurnRecall = null,
  getMidTurnRecallMessages = null,
}) {
  return async function marchPiContextExtension(pi) {
    pi.on("before_agent_start", () => {
      if (getContextMode() === "continueExistingPiTranscript") return undefined;
      return { systemPrompt: engine.buildProviderContext(getCurrentPrompt()).system };
    });

    pi.on("context", async (event) => {
      await waitForMidTurnRecall?.();
      return { messages: appendMissingRecallMessages(event.messages, getMidTurnRecallMessages?.() ?? []) };
    });

    pi.on("before_provider_request", (event, ctx) => {
      let payload = injectHostedTools(event.payload, ctx.model, hostedTools);
      payload = applyCodexLargeContextGuardToPayload(payload, { model: ctx.model, session: sessionBinding.get() });
      if (getFastEntry()) payload = { ...payload, service_tier: "priority" };
      return payload;
    });
  };
}

function appendMissingRecallMessages(messages, recallMessages) {
  if (recallMessages.length === 0) return messages;
  const existingText = messages.map(agentMessageText).join("\n");
  const missing = recallMessages.filter((content) => content && !existingText.includes(content));
  if (missing.length === 0) return messages;
  return [
    ...messages,
    ...missing.map((content) => ({
      role: "custom",
      customType: "march.recall",
      content,
      display: false,
      details: { type: "recall" },
      timestamp: Date.now(),
    })),
  ];
}

function agentMessageText(message) {
  if (typeof message?.content === "string") return message.content;
  if (Array.isArray(message?.content)) return message.content.map((part) => part?.text ?? "").join("");
  return "";
}
