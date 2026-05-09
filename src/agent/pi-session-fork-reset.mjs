import { PI_SIDECAR_VERSION, savePiSessionSidecarState } from "../session/sidecar.mjs";
import { createSidecarWriteFailure } from "./pi-session-sidecar-failure.mjs";

export async function forkPiSessionWithResetContext({
  runtimeHost,
  sessionBinding,
  engine,
  projectMarchDir,
  skillPool = [],
  entryId,
  getSessionStats,
  now = () => new Date(),
}) {
  if (!runtimeHost) throw new Error("pi runtime host is not enabled");
  if (!entryId) throw new Error("pi fork entry id is required");

  const activeSession = sessionBinding.get();
  const sourceStats = getSessionStats(activeSession, runtimeHost);
  if (!sourceStats.persisted || !sourceStats.sessionFile) {
    throw new Error("pi session is not persisted");
  }
  const candidates = activeSession.getUserMessagesForForking?.() ?? [];
  if (!candidates.some((candidate) => candidate.entryId === entryId)) {
    throw new Error(`pi fork entry not found: ${entryId}`);
  }

  const result = await runtimeHost.fork(entryId, { position: "before" });
  if (result?.cancelled) {
    return { cancelled: true, sourceSessionId: sourceStats.sessionId, entryId };
  }

  const forkedStats = getSessionStats(sessionBinding.get(), runtimeHost);
  const resetState = createResetSidecarState({
    engine,
    sourceStats,
    entryId,
    savedAt: now().toISOString(),
  });

  let sidecar;
  try {
    sidecar = savePiSessionSidecarState({
      projectMarchDir,
      sessionRef: forkedStats.sessionFile,
      state: resetState,
    });
  } catch (err) {
    throw await createSidecarWriteFailure({
      runtimeHost,
      sourceSessionFile: sourceStats.sessionFile,
      action: "fork reset",
      cause: err,
    });
  }
  engine.restoreSession(toContextSessionState(resetState), skillPool, { replace: true });

  return {
    cancelled: false,
    sessionId: forkedStats.sessionId,
    sessionFile: forkedStats.sessionFile,
    sourceSessionId: sourceStats.sessionId,
    entryId,
    selectedText: result?.selectedText,
    sidecarPath: sidecar.path,
  };
}

function createResetSidecarState({ engine, sourceStats, entryId, savedAt }) {
  return {
    version: PI_SIDECAR_VERSION,
    savedAt,
    derivedBy: "fork-reset",
    derivedAt: savedAt,
    derivedFromPiSessionId: sourceStats.sessionId,
    derivedFromPiSessionFile: sourceStats.sessionFile,
    derivedFromPiEntryId: entryId,
    sidecarMode: "reset-context",
    cwd: engine.cwd,
    modelId: engine.modelId,
    provider: engine.provider,
    thinkingLevel: engine.thinkingLevel,
    namespace: engine.namespace,
    turns: [],
    compactionSummary: null,
    pins: [],
    skills: [],
    openFiles: [],
  };
}

function toContextSessionState(sidecarState) {
  return {
    ...sidecarState,
    _compactionSummary: sidecarState.compactionSummary,
  };
}
