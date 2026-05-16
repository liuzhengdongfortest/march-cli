import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { listPiSessionInfos } from "../../session/pi-manager.mjs";
import { resumePiSessionById } from "../session/pi-session-switch-command.mjs";

export function loadOrCreateProjectId(projectMarchDir) {
  if (!existsSync(projectMarchDir)) mkdirSync(projectMarchDir, { recursive: true });
  const idFile = resolve(projectMarchDir, "project-id");
  if (existsSync(idFile)) {
    return readFileSync(idFile, "utf8").trim();
  }
  const id = randomUUID();
  writeFileSync(idFile, id, "utf8");
  return id;
}

export async function resumeStartupSession({
  resumeId,
  runner,
  sessionState,
  projectMarchDir,
  ui,
  listPiSessions = listPiSessionInfos,
}) {
  if (!resumeId) return { source: "none", lines: [] };

  const sessions = await listPiSessions({
    cwd: runner.engine.cwd,
    projectMarchDir,
  });
  const lines = await resumePiSessionById(resumeId, {
    runner,
    sessions,
    projectMarchDir,
  });
  for (const line of lines) ui.status(line);
  return { source: "pi", lines };
}
