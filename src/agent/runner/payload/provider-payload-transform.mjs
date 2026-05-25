import { injectHostedTools } from "../../../provider/hosted-tools.mjs";
import { replaceProviderContextMessages } from "../../model-payload-dumper.mjs";
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
      const shouldReplaceProviderContext = getContextMode() !== "continueExistingPiTranscript"
        && !didReplaceProviderContext;
      let nextPayload = payload;
      if (shouldReplaceProviderContext) {
        nextPayload = replaceProviderContextMessages(payload, engine.buildProviderContext(getCurrentPrompt()));
        didReplaceProviderContext = true;
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
  if (!Array.isArray(payload?.messages) || recallMessages.length === 0) return payload;
  const existingText = payload.messages.map((message) => providerMessageText(message)).join("\n");
  const missing = recallMessages.filter((content) => content && !existingText.includes(content));
  if (missing.length === 0) return payload;
  return {
    ...payload,
    messages: [
      ...payload.messages,
      ...missing.map((content) => ({ role: "user", content })),
    ],
  };
}

function providerMessageText(message) {
  if (typeof message?.content === "string") return message.content;
  if (Array.isArray(message?.content)) return message.content.map((part) => part?.text ?? "").join("");
  return "";
}
