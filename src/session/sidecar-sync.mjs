import { savePiSessionSidecar } from "./sidecar.mjs";

export function syncPiSessionSidecar({ enabled = false, projectMarchDir, engine, sessionStats, metadata = {} }) {
  if (!enabled || !projectMarchDir || !sessionStats?.persisted || !sessionStats.sessionFile) {
    return null;
  }

  return savePiSessionSidecar({
    projectMarchDir,
    sessionRef: sessionStats.sessionFile,
    engine,
    metadata: {
      sessionId: sessionStats.sessionId,
      sessionFile: sessionStats.sessionFile,
      runtimeHost: Boolean(sessionStats.runtimeHost),
      ...metadata,
    },
  });
}
