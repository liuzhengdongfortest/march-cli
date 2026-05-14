import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadSession } from "../../session/persist.mjs";
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
  usePiSessionDefaults,
  runner,
  sessionState,
  projectMarchDir,
  skillPool = [],
  ui,
  listPiSessions = listPiSessionInfos,
  loadLegacySession = loadSession,
}) {
  if (!resumeId) return { source: "none", lines: [] };

  if (usePiSessionDefaults) {
    const sessions = await listPiSessions({
      cwd: runner.engine.cwd,
      projectMarchDir,
    });
    const lines = await resumePiSessionById(resumeId, {
      runner,
      sessions,
      projectMarchDir,
      skillPool,
    });
    for (const line of lines) ui.status(line);
    return { source: "pi", lines };
  }

  const saved = loadLegacySession(sessionState.sessionDir);
  if (saved) {
    runner.engine.restoreSession(saved, skillPool);
    const line = `Resumed legacy session ${sessionState.sessionId} (${saved.turns.length} turns)`;
    ui.status(line);
    return { source: "legacy", lines: [line] };
  }

  const line = `Session ${sessionState.sessionId} not found — starting fresh`;
  ui.status(line);
  return { source: "legacy", lines: [line] };
}
