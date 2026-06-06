import { createHeartbeat, formatError } from "../../debug/logger.mjs";

export function beginLoggedAgentRun({ logger, engine, modelId, provider, contextMode, userMessage, userRecallHints, startedAt = Date.now() } = {}) {
  const agentRunId = `${startedAt.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  let phase = "starting";
  // Keep `turnId` in logger metadata for external diagnostics compatibility while core code uses Agent Run terminology.
  const agentRunLogger = logger?.child?.({ turnId: agentRunId, agentRunId, sessionName: engine?.sessionName, modelId, provider });
  const heartbeat = createHeartbeat({
    logger: agentRunLogger,
    event: "agent_run.heartbeat",
    getFields: () => ({ phase, elapsedMs: Date.now() - startedAt }),
  });
  agentRunLogger?.event("agent_run.start", {
    userMessageLength: String(userMessage ?? "").length,
    contextMode,
    userRecallHintCount: userRecallHints?.length ?? 0,
  });
  return {
    agentRunId,
    logger: agentRunLogger,
    setPhase(value) { phase = value; },
    endSuccess(result) {
      heartbeat.stop();
      agentRunLogger?.event("agent_run.end", { status: "success", durationMs: Date.now() - startedAt, draftLength: result?.draft?.length ?? 0 });
    },
    endError(err) {
      heartbeat.stop();
      agentRunLogger?.error("agent_run.error", { durationMs: Date.now() - startedAt, phase, error: formatError(err) });
    },
  };
}
