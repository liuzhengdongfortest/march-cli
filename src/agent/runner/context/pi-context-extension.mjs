import { injectHostedTools } from "../../../provider/hosted-tools.mjs";
import { formatRecallHints } from "../../../memory/markdown-store.mjs";
import { applyCodexLargeContextGuardToPayload } from "../codex-large-context-guard.mjs";

export function createMarchPiContextExtension({
  engine,
  sessionBinding,
  hostedTools = {},
  getCurrentPrompt,
  getContextMode,
  getFastEntry,
  flushAssistantRecall = null,
  onAssistantRecall = null,
  logger = null,
}) {
  return async function marchPiContextExtension(pi) {
    pi.on("before_agent_start", () => {
      if (getContextMode() === "continueExistingPiTranscript") return undefined;
      return { systemPrompt: engine.buildProviderContext(getCurrentPrompt()).system };
    });

    pi.on("context", async (event) => {
      const recallContent = await flushAssistantRecallMessage({ flushAssistantRecall, onAssistantRecall, logger });
      return { messages: appendRecallMessage(event.messages, recallContent) };
    });

    pi.on("before_provider_request", (event, ctx) => {
      let payload = injectHostedTools(event.payload, ctx.model, hostedTools);
      payload = applyCodexLargeContextGuardToPayload(payload, { model: ctx.model, session: sessionBinding.get() });
      if (getFastEntry()) payload = { ...payload, service_tier: "priority" };
      return payload;
    });
  };
}

async function flushAssistantRecallMessage({ flushAssistantRecall, onAssistantRecall, logger }) {
  if (!flushAssistantRecall) return "";
  try {
    const { hints = [], report = null } = await flushAssistantRecall();
    if (hints.length === 0) {
      if (report) onAssistantRecall?.({ hints, report });
      return "";
    }
    onAssistantRecall?.({ hints, report });
    return formatRecallHints(hints);
  } catch (err) {
    logger?.debug?.("memory.mid_turn_recall.failed", { errorMessage: err?.message ?? String(err) });
    return "";
  }
}

function appendRecallMessage(messages, content) {
  if (!content) return messages;
  return [
    ...messages,
    {
      role: "custom",
      customType: "march.recall",
      content,
      display: false,
      details: { type: "recall" },
      timestamp: Date.now(),
    },
  ];
}
