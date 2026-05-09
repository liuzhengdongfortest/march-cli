import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { SessionManager } from "@mariozechner/pi-coding-agent";

export function getPiSessionDir(projectMarchDir) {
  return join(projectMarchDir, "pi-sessions");
}

export function createPiSessionManager({ cwd, projectMarchDir }) {
  const sessionDir = getPiSessionDir(projectMarchDir);
  mkdirSync(sessionDir, { recursive: true });
  return SessionManager.create(cwd, sessionDir);
}

export function resolvePiSessionManager({ cwd, projectMarchDir, enabled = false }) {
  if (!enabled) return null;
  return createPiSessionManager({ cwd, projectMarchDir });
}

export async function listPiSessionInfos({ cwd, projectMarchDir }) {
  const sessionDir = getPiSessionDir(projectMarchDir);
  const sessions = await SessionManager.list(cwd, sessionDir);
  return sessions.map((session) => ({
    id: session.id,
    path: session.path,
    savedAt: session.modified?.toISOString?.() ?? "",
    createdAt: session.created?.toISOString?.() ?? "",
    cwd: session.cwd,
    name: session.name,
    turnCount: session.messageCount,
    firstMessage: session.firstMessage,
    parentSessionPath: session.parentSessionPath ?? null,
  }));
}
