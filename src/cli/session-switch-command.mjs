import { join } from "node:path";
import { loadSession, saveSession } from "../session/persist.mjs";

export function parseResumeCommand(input) {
  if (input === "/resume" || input.startsWith("/resume ")) {
    const id = input.slice("/resume".length).trim();
    if (!id) return { type: "error", message: "Usage: /resume <session-id>" };
    if (id.includes("/") || id.includes("\\") || id === "." || id === "..") {
      return { type: "error", message: "Session id must be a directory name, not a path." };
    }
    return { type: "resume", id };
  }
  return { type: "none" };
}

export function resumeSessionById(id, { runner, sessionState, sessionsRoot, skillPool = [] }) {
  const targetDir = join(sessionsRoot, id);
  const saved = loadSession(targetDir);
  if (!saved) return [`Error: session not found: ${id}`];

  saveSession(sessionState.sessionDir, runner.engine);
  runner.engine.restoreSession(saved, skillPool, { replace: true });
  sessionState.sessionId = id;
  sessionState.sessionDir = targetDir;
  return [`Resumed session: ${id} (${saved.turns.length} turns)`];
}
