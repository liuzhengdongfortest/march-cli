import { saveMarchSessionState } from "./march-session-state.mjs";

export function syncMarchSessionState({ enabled = false, projectMarchDir, engine, sessionStats, metadata = {} }) {
  if (!enabled || !projectMarchDir || !sessionStats?.persisted || !sessionStats.sessionId) {
    return null;
  }

  return saveMarchSessionState({
    projectMarchDir,
    sessionId: sessionStats.sessionId,
    engine,
    backend: {
      type: "pi",
      sessionId: sessionStats.sessionId,
      sessionFile: sessionStats.sessionFile ?? null,
      runtimeHost: Boolean(sessionStats.runtimeHost),
    },
    metadata,
  });
}
