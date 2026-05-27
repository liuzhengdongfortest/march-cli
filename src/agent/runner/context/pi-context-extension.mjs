import { injectHostedTools } from "../../../provider/hosted-tools.mjs";
import { applyCodexLargeContextGuardToPayload } from "../codex-large-context-guard.mjs";
import { createRecallCustomMessage } from "../recall/recall-message.mjs";

export function createMarchPiContextExtension({
  engine,
  sessionBinding,
  hostedTools = {},
  getCurrentPrompt,
  getContextMode,
  getFastEntry,
  getUserRecallHints = null,
  sendAssistantRecallMessage = null,
  observeAssistantMessageEvent = null,
  flushAssistantRecall = null,
  onAssistantRecall = null,
  logger = null,
}) {
  return async function marchPiContextExtension(pi) {
    pi.on("before_agent_start", () => {
      const result = {};
      if (getContextMode() !== "continueExistingPiTranscript") {
        result.systemPrompt = engine.buildProviderContext(getCurrentPrompt()).system;
      }
      const recallMessage = createRecallCustomMessage(getUserRecallHints?.() ?? [], { source: "user" });
      if (recallMessage) result.messages = [recallMessage];
      return Object.keys(result).length > 0 ? result : undefined;
    });

    pi.on("message_update", (event) => {
      observeAssistantMessageEvent?.(event.assistantMessageEvent);
    });

    pi.on("turn_end", async (event) => {
      if (event.message?.role !== "assistant") return;
      if (!assistantMessageHasToolCalls(event.message) && (event.toolResults?.length ?? 0) === 0) return;
      await steerAssistantRecallMessage(pi, { flushAssistantRecall, onAssistantRecall, sendAssistantRecallMessage, logger });
    });

    pi.on("before_provider_request", (event, ctx) => {
      let payload = injectHostedTools(event.payload, ctx.model, hostedTools);
      payload = applyCodexLargeContextGuardToPayload(payload, { model: ctx.model, session: sessionBinding.get() });
      if (getFastEntry()) payload = { ...payload, service_tier: "priority" };
      return payload;
    });
  };
}

async function steerAssistantRecallMessage(pi, { flushAssistantRecall, onAssistantRecall, sendAssistantRecallMessage, logger }) {
  if (!flushAssistantRecall) return;
  try {
    const { hints = [], report = null } = await flushAssistantRecall();
    if (hints.length === 0) {
      if (report) onAssistantRecall?.({ hints, report });
      return;
    }
    onAssistantRecall?.({ hints, report });
    const message = createRecallCustomMessage(hints, { source: "assistant" });
    if (message) sendAssistantRecallMessage ? await sendAssistantRecallMessage(message) : pi.sendMessage(message, { deliverAs: "steer" });
  } catch (err) {
    logger?.debug?.("memory.mid_turn_recall.failed", { errorMessage: err?.message ?? String(err) });
  }
}

function assistantMessageHasToolCalls(message) {
  return (message?.content ?? []).some((part) => part?.type === "toolCall");
}
