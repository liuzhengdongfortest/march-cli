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
