import {
  captureMarchSessionState,
  getLegacyPiSidecarDir,
  getLegacyPiSidecarPath,
  loadMarchSessionStateForPiBackend,
  loadLegacyPiSidecar,
  saveMarchSessionStateValue,
} from "./state/march-session-state.mjs";

export const PI_SIDECAR_VERSION = 1;

export function getPiSidecarDir(projectMarchDir) {
  return getLegacyPiSidecarDir(projectMarchDir);
}

export function getPiSidecarPath(projectMarchDir, sessionRef) {
  return getLegacyPiSidecarPath(projectMarchDir, sessionRef);
}

export function captureContextSidecar(engine, metadata = {}) {
  return captureMarchSessionState(engine, {
    sessionId: metadata.sessionId,
    backend: {
      type: "pi",
      sessionId: metadata.sessionId ?? null,
      sessionFile: metadata.sessionFile ?? null,
      runtimeHost: Boolean(metadata.runtimeHost),
    },
    metadata,
  });
}

export function savePiSessionSidecar({ projectMarchDir, sessionRef, engine, metadata = {} }) {
  return savePiSessionSidecarState({
    projectMarchDir,
    sessionRef,
    state: captureContextSidecar(engine, { sessionFile: sessionRef, ...metadata }),
  });
}

export function savePiSessionSidecarState({ projectMarchDir, sessionRef, state }) {
  return saveMarchSessionStateValue({
    projectMarchDir,
    sessionId: state.sessionId ?? state.backend?.sessionId ?? state.sessionFile ?? sessionRef,
    state: normalizeLegacyState(state, sessionRef),
  });
}

export function loadPiSessionSidecar({ projectMarchDir, sessionRef }) {
  return loadMarchSessionStateForPiBackend({ projectMarchDir, sessionId: null, sessionRef }) ?? loadLegacyPiSidecar({ projectMarchDir, sessionRef });
}

export function loadPiSessionContextState({ projectMarchDir, sessionRef, sessionId = null }) {
  return loadMarchSessionStateForPiBackend({ projectMarchDir, sessionId, sessionRef });
}

function normalizeLegacyState(state, sessionRef) {
  return {
    ...state,
    sessionId: state.sessionId ?? state.backend?.sessionId ?? state.sessionFile ?? sessionRef,
    backend: state.backend ?? {
      type: "pi",
      sessionId: state.sessionId ?? null,
      sessionFile: state.sessionFile ?? sessionRef,
      runtimeHost: Boolean(state.runtimeHost),
    },
  };
}
