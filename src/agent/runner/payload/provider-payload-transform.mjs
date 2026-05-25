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
}) {
  let didReplaceProviderContext = false;

  return {
    resetTurn() {
      didReplaceProviderContext = false;
    },
    transform(payload, { kind, model } = {}) {
      if (kind !== "user") return payload;
      const shouldReplaceProviderContext = getContextMode() !== "continueExistingPiTranscript"
        && !didReplaceProviderContext;
      let nextPayload = payload;
      if (shouldReplaceProviderContext) {
        nextPayload = replaceProviderContextMessages(payload, engine.buildProviderContext(getCurrentPrompt()));
        didReplaceProviderContext = true;
      }
      nextPayload = injectHostedTools(nextPayload, model, hostedTools);
      nextPayload = applyCodexLargeContextGuardToPayload(nextPayload, { model, session: sessionBinding.get() });
      if (getFastEntry()) nextPayload = { ...nextPayload, service_tier: "priority" };
      return nextPayload;
    },
  };
}
