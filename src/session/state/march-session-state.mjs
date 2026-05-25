import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { loadPiSessionTranscriptTurns } from "../transcript.mjs";

export const MARCH_SESSION_STATE_VERSION = 1;

export function getMarchSessionStateRoot(projectMarchDir) {
  return join(projectMarchDir, "sessions");
}

export function getMarchSessionStateDir(projectMarchDir, sessionId) {
  return join(getMarchSessionStateRoot(projectMarchDir), normalizeSessionId(sessionId));
}

export function getMarchSessionStatePath(projectMarchDir, sessionId) {
  return join(getMarchSessionStateDir(projectMarchDir, sessionId), "state.json");
}

export function captureMarchSessionState(engine, { sessionId, backend = null, metadata = {} } = {}) {
  return {
    version: MARCH_SESSION_STATE_VERSION,
    savedAt: new Date().toISOString(),
    sessionId: sessionId ?? metadata.sessionId ?? backend?.sessionId ?? null,
    backend,
    ...metadata,
    cwd: engine.cwd,
    modelId: engine.modelId,
    provider: engine.provider,
    sessionName: engine.sessionName ?? "",
    thinkingLevel: engine.thinkingLevel,
    namespace: engine.namespace,
    pendingAssistantRecallHints: engine.pendingAssistantRecallHints ?? [],
    turns: engine.turns,
  };
}

export function saveMarchSessionState({ projectMarchDir, sessionId, engine, backend = null, metadata = {} }) {
  return saveMarchSessionStateValue({
    projectMarchDir,
    sessionId,
    state: captureMarchSessionState(engine, { sessionId, backend, metadata }),
  });
}

export function saveMarchSessionStateValue({ projectMarchDir, sessionId, state }) {
  if (!sessionId) throw new Error("March session id is required");
  validateMarchSessionState(state);
  const dir = getMarchSessionStateDir(projectMarchDir, sessionId);
  mkdirSync(dir, { recursive: true });
  const path = getMarchSessionStatePath(projectMarchDir, sessionId);
  writeFileSync(path, JSON.stringify({ ...state, sessionId: state.sessionId ?? sessionId }, null, 2), "utf8");
  return { path, state: { ...state, sessionId: state.sessionId ?? sessionId } };
}

export function loadMarchSessionState({ projectMarchDir, sessionId }) {
  const path = getMarchSessionStatePath(projectMarchDir, sessionId);
  if (!existsSync(path)) return null;
  const state = JSON.parse(readFileSync(path, "utf8"));
  if (!isValidMarchSessionState(state)) throw new Error("Invalid March session state");
  return { path, state };
}

export function loadMarchSessionContextState({ projectMarchDir, sessionId, backendSessionFile = null }) {
  const stored = loadMarchSessionState({ projectMarchDir, sessionId });
  if (!stored) return null;
  const sessionFile = backendSessionFile ?? stored.state.backend?.sessionFile ?? stored.state.sessionFile ?? null;
  return { ...stored, state: withBackendTranscriptTurns(stored.state, sessionFile) };
}

export function listMarchSessionStates({ projectMarchDir }) {
  const root = getMarchSessionStateRoot(projectMarchDir);
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      try {
        return loadMarchSessionState({ projectMarchDir, sessionId: entry.name });
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

export function loadMarchSessionStateForPiBackend({ projectMarchDir, sessionId, sessionRef }) {
  const marchState = sessionId ? loadMarchSessionContextState({ projectMarchDir, sessionId, backendSessionFile: sessionRef }) : null;
  if (marchState) return marchState;
  const matchingState = findMarchSessionStateByPiBackend({ projectMarchDir, sessionRef });
  if (matchingState) return { ...matchingState, state: withBackendTranscriptTurns(matchingState.state, sessionRef) };
  return loadLegacyPiSidecarContextState({ projectMarchDir, sessionRef });
}

function findMarchSessionStateByPiBackend({ projectMarchDir, sessionRef }) {
  const normalizedRef = normalizeSessionRef(sessionRef);
  return listMarchSessionStates({ projectMarchDir }).find(({ state }) => {
    const sessionFile = state.backend?.sessionFile ?? state.sessionFile ?? null;
    return sessionFile && normalizeSessionRef(sessionFile) === normalizedRef;
  }) ?? null;
}

export function getLegacyPiSidecarDir(projectMarchDir) {
  return join(projectMarchDir, "pi-sidecars");
}

export function getLegacyPiSidecarPath(projectMarchDir, sessionRef) {
  return join(getLegacyPiSidecarDir(projectMarchDir), `${normalizeSessionRef(sessionRef)}.json`);
}

export function loadLegacyPiSidecar({ projectMarchDir, sessionRef }) {
  const path = getLegacyPiSidecarPath(projectMarchDir, sessionRef);
  if (!existsSync(path)) return null;
  const state = JSON.parse(readFileSync(path, "utf8"));
  if (!isValidMarchSessionState(state)) throw new Error("Invalid March session state");
  return { path, state };
}

export function loadLegacyPiSidecarContextState({ projectMarchDir, sessionRef }) {
  const legacy = loadLegacyPiSidecar({ projectMarchDir, sessionRef });
  if (!legacy) return null;
  return { ...legacy, state: withBackendTranscriptTurns(legacy.state, sessionRef) };
}

export function normalizeSessionId(sessionId) {
  const value = String(sessionId ?? "").trim();
  if (!value || value === "." || value === "..") throw new Error("Invalid March session id");
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function validateMarchSessionState(state) {
  if (!isValidMarchSessionState(state)) throw new Error("Invalid March session state");
}

function isValidMarchSessionState(state) {
  return state?.version === MARCH_SESSION_STATE_VERSION && Boolean(state.cwd) && Array.isArray(state.turns);
}

function normalizeSessionRef(sessionRef) {
  const ref = basename(String(sessionRef).trim()).replace(/\.jsonl$/i, "");
  if (!ref || ref === "." || ref === "..") throw new Error("Invalid pi session reference");
  return ref.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function withBackendTranscriptTurns(state, sessionFile) {
  if (!sessionFile) return { ...state };
  let transcriptTurns = [];
  try {
    transcriptTurns = loadPiSessionTranscriptTurns(sessionFile);
  } catch {
    return { ...state };
  }
  if (transcriptTurns.length <= (state.turns?.length ?? 0)) return { ...state };
  return { ...state, turns: transcriptTurns };
}
