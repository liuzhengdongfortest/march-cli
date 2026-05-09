import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

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
    namespace: engine.namespace,
    turns: engine.turns,
    compactionSummary: engine._compactionSummary ?? null,
    pins: [...engine.pins],
    skills: engine.skills.map((skill) => typeof skill === "string" ? skill : skill.name),
    openFiles: [...engine.openFiles.keys()],
  };
}

export function savePiSessionSidecar({ projectMarchDir, sessionRef, engine, metadata = {} }) {
  const sidecarDir = getPiSidecarDir(projectMarchDir);
  mkdirSync(sidecarDir, { recursive: true });
  const state = captureContextSidecar(engine, metadata);
  const path = getPiSidecarPath(projectMarchDir, sessionRef);
  writeFileSync(path, JSON.stringify(state, null, 2), "utf8");
  return { path, state };
}

export function loadPiSessionSidecar({ projectMarchDir, sessionRef }) {
  const path = getPiSidecarPath(projectMarchDir, sessionRef);
  if (!existsSync(path)) return null;
  const state = JSON.parse(readFileSync(path, "utf8"));
  if (state.version !== PI_SIDECAR_VERSION || !state.cwd || !Array.isArray(state.turns)) {
    throw new Error("Invalid pi session sidecar");
  }
  return { path, state };
}

function normalizeSessionRef(sessionRef) {
  const ref = basename(String(sessionRef).trim()).replace(/\.jsonl$/i, "");
  if (!ref || ref === "." || ref === "..") throw new Error("Invalid pi session reference");
  return ref.replace(/[^a-zA-Z0-9._-]/g, "_");
}
