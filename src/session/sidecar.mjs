import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { loadPiSessionTranscriptTurns } from "./transcript.mjs";

export const PI_SIDECAR_VERSION = 1;

export function getPiSidecarDir(projectMarchDir) {
  return join(projectMarchDir, "pi-sidecars");
}

export function getPiSidecarPath(projectMarchDir, sessionRef) {
  return join(getPiSidecarDir(projectMarchDir), `${normalizeSessionRef(sessionRef)}.json`);
}

export function captureContextSidecar(engine, metadata = {}) {
  return {
    version: PI_SIDECAR_VERSION,
    savedAt: new Date().toISOString(),
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

export function savePiSessionSidecar({ projectMarchDir, sessionRef, engine, metadata = {} }) {
  return savePiSessionSidecarState({
    projectMarchDir,
    sessionRef,
    state: captureContextSidecar(engine, metadata),
  });
}

export function savePiSessionSidecarState({ projectMarchDir, sessionRef, state }) {
  const sidecarDir = getPiSidecarDir(projectMarchDir);
  mkdirSync(sidecarDir, { recursive: true });
  validateSidecarState(state);
  const path = getPiSidecarPath(projectMarchDir, sessionRef);
  writeFileSync(path, JSON.stringify(state, null, 2), "utf8");
  return { path, state };
}

export function loadPiSessionSidecar({ projectMarchDir, sessionRef }) {
  const path = getPiSidecarPath(projectMarchDir, sessionRef);
  if (!existsSync(path)) return null;
  const state = JSON.parse(readFileSync(path, "utf8"));
  if (!isValidSidecarState(state)) {
    throw new Error("Invalid pi session sidecar");
  }
  return { path, state };
}

export function loadPiSessionContextState({ projectMarchDir, sessionRef }) {
  const sidecar = loadPiSessionSidecar({ projectMarchDir, sessionRef });
  if (!sidecar) return null;
  return { ...sidecar, state: withTranscriptTurns(sidecar.state, sessionRef) };
}

function validateSidecarState(state) {
  if (!isValidSidecarState(state)) throw new Error("Invalid pi session sidecar");
}

function isValidSidecarState(state) {
  return state?.version === PI_SIDECAR_VERSION && Boolean(state.cwd) && Array.isArray(state.turns);
}

function normalizeSessionRef(sessionRef) {
  const ref = basename(String(sessionRef).trim()).replace(/\.jsonl$/i, "");
  if (!ref || ref === "." || ref === "..") throw new Error("Invalid pi session reference");
  return ref.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function withTranscriptTurns(state, sessionRef) {
  let transcriptTurns = [];
  try {
    transcriptTurns = loadPiSessionTranscriptTurns(sessionRef);
  } catch {
    return { ...state };
  }
  if (transcriptTurns.length <= (state.turns?.length ?? 0)) return { ...state };
  return { ...state, turns: transcriptTurns };
}
