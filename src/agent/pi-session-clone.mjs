import { syncPiSessionSidecar } from "../session/sidecar-sync.mjs";

export async function cloneCurrentPiSession({
  runtimeHost,
  sessionBinding,
  engine,
  projectMarchDir,
  getSessionStats,
  now = () => new Date(),
}) {
  if (!runtimeHost) throw new Error("pi runtime host is not enabled");
  const activeSession = sessionBinding.get();
  const sourceStats = getSessionStats(activeSession, runtimeHost);
  if (!sourceStats.persisted || !sourceStats.sessionFile) {
    throw new Error("pi session is not persisted");
  }
  const leafId = activeSession.sessionManager?.getLeafId?.();
  if (!leafId) {
    throw new Error("pi session has no active leaf to clone");
  }

  const result = await runtimeHost.fork(leafId, { position: "at" });
  if (result?.cancelled) {
    return { cancelled: true, sourceSessionId: sourceStats.sessionId };
  }

  const clonedStats = getSessionStats(sessionBinding.get(), runtimeHost);
  const sidecar = syncPiSessionSidecar({
    enabled: true,
    projectMarchDir,
    engine,
    sessionStats: clonedStats,
    metadata: {
      derivedBy: "clone",
      derivedAt: now().toISOString(),
      derivedFromPiSessionId: sourceStats.sessionId,
      derivedFromPiSessionFile: sourceStats.sessionFile,
    },
  });
  if (!sidecar) {
    throw new Error("failed to write pi session sidecar");
  }

  return {
    cancelled: false,
    sessionId: clonedStats.sessionId,
    sessionFile: clonedStats.sessionFile,
    sourceSessionId: sourceStats.sessionId,
    sidecarPath: sidecar.path,
  };
}
