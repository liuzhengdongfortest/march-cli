import { writeFileSync, readFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export function saveSession(sessionDir, engine, metadata = {}) {
  mkdirSync(sessionDir, { recursive: true });

  const state = {
    ...metadata,
    savedAt: new Date().toISOString(),
    cwd: engine.cwd,
    modelId: engine.modelId,
    provider: engine.provider,
    turns: engine.turns,
    _compactionSummary: engine._compactionSummary,
    pins: [...engine.pins],
    skills: engine.skills.map(s => typeof s === "string" ? s : s.name),
    openFiles: [...engine.openFiles.keys()],
  };

  writeFileSync(join(sessionDir, "session.json"), JSON.stringify(state, null, 2), "utf8");
  return state;
}

export function forkSession(sessionsRoot, sourceSessionId, engine, { targetSessionId = null } = {}) {
  const forkedAt = new Date().toISOString();
  const id = targetSessionId ?? `${Date.now().toString(36)}-fork`;
  const sessionDir = join(sessionsRoot, id);
  const state = saveSession(sessionDir, engine, { parentSessionId: sourceSessionId, forkedAt });
  return { id, sessionDir, state };
}

export function loadSession(sessionDir) {
  const path = join(sessionDir, "session.json");
  if (!existsSync(path)) return null;

  const raw = readFileSync(path, "utf8");
  const state = JSON.parse(raw);

  if (!state.cwd || !Array.isArray(state.turns)) {
    throw new Error("Invalid session file");
  }

  return state;
}

export function listSessions(sessionsRoot) {
  if (!existsSync(sessionsRoot)) return [];

  return readdirSync(sessionsRoot, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => {
      const sessionFile = join(sessionsRoot, e.name, "session.json");
      if (!existsSync(sessionFile)) return null;
      try {
        const raw = readFileSync(sessionFile, "utf8");
        const { savedAt, cwd, turns, parentSessionId } = JSON.parse(raw);
        return { id: e.name, savedAt, cwd, turnCount: turns?.length ?? 0, parentSessionId: parentSessionId ?? null };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => (b.savedAt ?? "").localeCompare(a.savedAt ?? ""));
}
