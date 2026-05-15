import { listPiSessionInfos } from "../../session/pi-manager.mjs";
import { clonePiSession, parseClonePiCommand } from "./pi-session-clone-command.mjs";
import { forkPiSessionResetContext, listPiForkCandidates, listPiSessionEntryCandidates, parseForkPiCommand } from "./pi-session-fork-command.mjs";
import { parseResumePiCommand, resumePiSessionById } from "./pi-session-switch-command.mjs";
import { formatPiSessionList, formatPiSessionTree } from "./session-list-command.mjs";

export async function handleSessionSourceCommand(trimmed, {
  ui,
  runner,
  sessionState,
  sessionsRoot,
  projectMarchDir,
  skillPool = [],
}) {
  if (trimmed === "/save") {
    const stats = runner.getSessionStats?.();
    ui.writeln(`Pi session auto-saved: ${stats?.sessionId ?? sessionState.sessionId}`);
    return { handled: true };
  }

  if (trimmed === "/fork") {
    ui.writeln("Pi sessions use explicit branch commands: /clone-pi for current branch, or /fork-pi for entry candidates.");
    return { handled: true };
  }

  if (trimmed === "/sessions" || trimmed === "/sessions tree") {
    const sessions = await listPiSessionInfos({
      cwd: runner.engine.cwd,
      projectMarchDir,
    });
    const currentPiSessionId = runner.getSessionStats?.().sessionId ?? null;
    const lines = trimmed === "/sessions tree"
      ? formatPiSessionTree(sessions, currentPiSessionId)
      : formatPiSessionList(sessions);
    for (const line of lines) ui.writeln(line);
    return { handled: true };
  }

  if (trimmed === "/sessions pi" || trimmed === "/sessions pi tree") {
    const sessions = await listPiSessionInfos({
      cwd: runner.engine.cwd,
      projectMarchDir,
    });
    const currentPiSessionId = runner.getSessionStats?.().sessionId ?? null;
    const lines = trimmed === "/sessions pi tree"
      ? formatPiSessionTree(sessions, currentPiSessionId)
      : formatPiSessionList(sessions);
    for (const line of lines) ui.writeln(line);
    return { handled: true };
  }

  const resumePiCommand = parseResumePiCommand(trimmed);
  if (resumePiCommand.type !== "none") {
    if (resumePiCommand.type === "error") {
      ui.writeln(`Error: ${resumePiCommand.message}`);
    } else {
      const sessions = await listPiSessionInfos({
        cwd: runner.engine.cwd,
        projectMarchDir,
      });
      for (const line of await resumePiSessionById(resumePiCommand.id, {
        runner,
        sessions,
        projectMarchDir,
        skillPool,
      })) {
        ui.writeln(line);
      }
    }
    return { handled: true };
  }

  const clonePiCommand = parseClonePiCommand(trimmed);
  if (clonePiCommand.type !== "none") {
    if (clonePiCommand.type === "error") {
      ui.writeln(`Error: ${clonePiCommand.message}`);
    } else {
      for (const line of await clonePiSession({ runner })) ui.writeln(line);
    }
    return { handled: true };
  }

  const forkPiCommand = parseForkPiCommand(trimmed);
  if (forkPiCommand.type !== "none") {
    if (forkPiCommand.type === "error") {
      ui.writeln(`Error: ${forkPiCommand.message}`);
    } else if (forkPiCommand.type === "fork-pi-reset") {
      for (const line of await forkPiSessionResetContext(forkPiCommand.entryId, { runner })) ui.writeln(line);
    } else {
      for (const line of listPiForkCandidates({ runner })) ui.writeln(line);
    }
    return { handled: true };
  }

  if (trimmed === "/session entries") {
    for (const line of listPiSessionEntryCandidates({ runner })) ui.writeln(line);
    return { handled: true };
  }

  return { handled: false };
}
