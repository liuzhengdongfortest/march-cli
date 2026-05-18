import { createHeartbeat, formatError } from "../../debug/logger.mjs";

export function beginLoggedTurn({ logger, engine, modelId, provider, contextMode, userMessage, userRecallHints, startedAt = Date.now() } = {}) {
  const turnId = `${startedAt.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  let phase = "starting";
  const turnLogger = logger?.child?.({ turnId, sessionName: engine?.sessionName, modelId, provider });
  const heartbeat = createHeartbeat({
    logger: turnLogger,
    event: "turn.heartbeat",
    getFields: () => ({ phase, elapsedMs: Date.now() - startedAt }),
  });
  turnLogger?.event("turn.start", {
    userMessageLength: String(userMessage ?? "").length,
    contextMode,
    userRecallHintCount: userRecallHints?.length ?? 0,
  });
  return {
    turnId,
    logger: turnLogger,
    setPhase(value) { phase = value; },
    endSuccess(result) {
      heartbeat.stop();
      turnLogger?.event("turn.end", { status: "success", durationMs: Date.now() - startedAt, draftLength: result?.draft?.length ?? 0 });
    },
    endError(err) {
      heartbeat.stop();
      turnLogger?.error("turn.error", { durationMs: Date.now() - startedAt, phase, error: formatError(err) });
    },
  };
}
