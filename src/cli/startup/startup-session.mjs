import { loadOrCreateProjectId } from "../../workspace/project-id.mjs";
import { listPiSessionInfos } from "../../session/pi-manager.mjs";

import { loadPiSessionTranscriptTurns } from "../../session/transcript.mjs";
import { resumePiSessionById } from "../session/pi-session-switch-command.mjs";

export { loadOrCreateProjectId };

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
  return { source: "pi", lines, transcriptTurns: loadResumeTranscriptTurns(resumeId, sessions, lines) };
}

function loadResumeTranscriptTurns(resumeId, sessions, lines) {
  if (!Array.isArray(lines) || !lines.some((line) => String(line).startsWith("Resumed pi session:"))) return [];
  const matches = sessions.filter((session) => session.id.startsWith(resumeId));
  if (matches.length !== 1) return [];
  try {
    return loadPiSessionTranscriptTurns(matches[0].path);
  } catch {
    return [];
  }
}
