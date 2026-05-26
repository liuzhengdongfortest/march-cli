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
  getAssistantRecallCursor = null,
  setAssistantRecallCursor = null,
  recallForAssistantText = null,
  onAssistantRecall = null,
  logger = null,
}) {
  return async function marchPiContextExtension(pi) {
    pi.on("before_agent_start", () => {
      if (getContextMode() === "continueExistingPiTranscript") return undefined;
      return { systemPrompt: engine.buildProviderContext(getCurrentPrompt()).system };
    });

    pi.on("context", async (event) => {
      const recallContent = await recallAssistantDeltaFromMessages({
        messages: event.messages,
        getAssistantRecallCursor,
        setAssistantRecallCursor,
        recallForAssistantText,
        onAssistantRecall,
        logger,
      });
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

async function recallAssistantDeltaFromMessages({ messages, getAssistantRecallCursor, setAssistantRecallCursor, recallForAssistantText, onAssistantRecall, logger }) {
  if (!recallForAssistantText) return "";
  try {
    const fullText = extractAssistantRecallText(messages);
    const previous = getAssistantRecallCursor?.();
    setAssistantRecallCursor?.(fullText.length);
    const text = fullText.slice(previous ?? 0).trim();
    if (!text) return "";
    const { hints = [], report = null } = await recallForAssistantText(text);
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

export function extractAssistantRecallText(messages = []) {
  return messages
    .filter((message) => message?.role === "assistant")
    .flatMap((message) => extractContentText(message.content))
    .filter(Boolean)
    .join("\n");
}

function extractContentText(content) {
  if (typeof content === "string") return [content];
  if (!Array.isArray(content)) return [];
  return content.flatMap((part) => {
    if (!part || typeof part !== "object") return [];
    if (part.type === "toolCall") return [];
    if (typeof part.text === "string") return [part.text];
    if (typeof part.thinking === "string") return [part.thinking];
    if (Array.isArray(part.thinking)) return part.thinking.map((item) => item?.text ?? "").filter(Boolean);
    return [];
  });
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
