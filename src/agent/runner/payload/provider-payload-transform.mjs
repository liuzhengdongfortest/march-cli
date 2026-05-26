import { injectHostedTools } from "../../../provider/hosted-tools.mjs";
import { appendProviderUserMessage, replaceProviderContextMessages } from "../../model-payload-dumper.mjs";
import { applyCodexLargeContextGuardToPayload } from "../codex-large-context-guard.mjs";

export function createRunnerProviderPayloadTransform({
  engine,
  sessionBinding,
  hostedTools,
  getCurrentPrompt,
  getContextMode,
  getFastEntry,
  waitForMidTurnRecall = null,
  getMidTurnRecallMessages = null,
}) {
  let didReplaceProviderContext = false;

  return {
    resetTurn() {
      didReplaceProviderContext = false;
    },
    async transform(payload, { kind, model } = {}) {
      if (kind !== "user") return payload;
      const shouldReplaceProviderContext = getContextMode() !== "continueExistingPiTranscript";
      let nextPayload = payload;
      if (shouldReplaceProviderContext) {
        if (didReplaceProviderContext) await waitForMidTurnRecall?.();
        nextPayload = replaceProviderContextMessages(payload, engine.buildProviderContext(getCurrentPrompt()));
        didReplaceProviderContext = true;
        nextPayload = appendMissingMidTurnRecallMessages(nextPayload, getMidTurnRecallMessages?.() ?? []);
      } else {
        await waitForMidTurnRecall?.();
        nextPayload = appendMissingMidTurnRecallMessages(nextPayload, getMidTurnRecallMessages?.() ?? []);
      }
      nextPayload = injectHostedTools(nextPayload, model, hostedTools);
      nextPayload = applyCodexLargeContextGuardToPayload(nextPayload, { model, session: sessionBinding.get() });
      if (getFastEntry()) nextPayload = { ...nextPayload, service_tier: "priority" };
      return nextPayload;
    },
  };
}

function appendMissingMidTurnRecallMessages(payload, recallMessages) {
  if (recallMessages.length === 0) return payload;
  const existingText = providerPayloadText(payload);
  const missing = recallMessages.filter((content) => content && !existingText.includes(content));
  return missing.reduce((next, content) => appendProviderUserMessage(next, content), payload);
}

function providerPayloadText(payload) {
  if (Array.isArray(payload?.messages)) return payload.messages.map((message) => providerMessageText(message)).join("\n");
  if (Array.isArray(payload?.input)) return payload.input.map((item) => providerMessageText(item)).join("\n");
  if (payload?.body && typeof payload.body === "object") return providerPayloadText(payload.body);
  if (typeof payload?.body === "string") {
    try { return providerPayloadText(JSON.parse(payload.body)); } catch {}
  }
  return "";
}

function providerMessageText(message) {
  if (typeof message?.content === "string") return message.content;
  if (Array.isArray(message?.content)) return message.content.map((part) => part?.text ?? "").join("");
  return "";
}
