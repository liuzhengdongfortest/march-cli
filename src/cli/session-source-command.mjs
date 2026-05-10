import { saveSession, listSessions, forkSession } from "../session/persist.mjs";
import { listPiSessionInfos } from "../session/pi-manager.mjs";
import { clonePiSession, parseClonePiCommand } from "./pi-session-clone-command.mjs";
import { forkPiSessionResetContext, listPiForkCandidates, listPiSessionEntryCandidates, parseForkPiCommand } from "./pi-session-fork-command.mjs";
import { parseResumePiCommand, resumePiSessionById } from "./pi-session-switch-command.mjs";
import { formatPiSessionList, formatPiSessionTree, listSessionCommand } from "./session-list-command.mjs";
import { parseResumeCommand, resumeSessionById } from "./session-switch-command.mjs";

export async function handleSessionSourceCommand(trimmed, {
  ui,
  runner,
  sessionState,
  sessionsRoot,
  projectMarchDir,
  skillPool = [],
  sessionSource = "legacy",
}) {
  if (trimmed === "/save") {
    writeSessionSaveStatus({ ui, runner, sessionState, sessionSource });
    return { handled: true };
  }

  if (trimmed === "/fork") {
    if (sessionSource === "pi") {
      ui.writeln("Pi sessions use explicit branch commands: /clone-pi for current branch, or /fork-pi for entry candidates.");
      return { handled: true };
    }
    const forked = forkSession(sessionsRoot, sessionState.sessionId, runner.engine);
    sessionState.sessionId = forked.id;
    sessionState.sessionDir = forked.sessionDir;
    ui.writeln(`Forked session: ${sessionState.sessionId} (parent: ${forked.state.parentSessionId})`);
    return { handled: true };
  }

  if (trimmed === "/fork-legacy") {
    const forked = forkSession(sessionsRoot, sessionState.sessionId, runner.engine);
    sessionState.sessionId = forked.id;
    sessionState.sessionDir = forked.sessionDir;
    ui.writeln(`Forked legacy session: ${sessionState.sessionId} (parent: ${forked.state.parentSessionId})`);
    return { handled: true };
  }

  if (trimmed === "/sessions" || trimmed === "/sessions tree") {
    if (sessionSource === "pi") {
      for (const line of await listCurrentPiSessions({
        tree: trimmed === "/sessions tree",
        runner,
        projectMarchDir,
      })) ui.writeln(line);
    } else {
      const sessions = listSessions(sessionsRoot);
      for (const line of listSessionCommand({
        sessions,
        currentSessionId: sessionState.sessionId,
        tree: trimmed === "/sessions tree",
      })) ui.writeln(line);
    }
    return { handled: true };
  }

  if (trimmed === "/sessions legacy" || trimmed === "/sessions legacy tree") {
    const sessions = listSessions(sessionsRoot);
    for (const line of listSessionCommand({
      sessions,
      currentSessionId: sessionState.sessionId,
      tree: trimmed === "/sessions legacy tree",
    })) ui.writeln(line);
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

  const resumeCommand = parseResumeCommand(trimmed);
  if (resumeCommand.type !== "none") {
    if (resumeCommand.type === "error") {
      ui.writeln(`Error: ${resumeCommand.message}`);
    } else if (sessionSource === "pi") {
      const sessions = await listPiSessionInfos({
        cwd: runner.engine.cwd,
        projectMarchDir,
      });
      for (const line of await resumePiSessionById(resumeCommand.id, {
        runner,
        sessions,
        projectMarchDir,
        skillPool,
      })) {
        ui.writeln(line.replace("Resumed pi session:", "Resumed session:"));
      }
    } else {
      for (const line of resumeSessionById(resumeCommand.id, { runner, sessionState, sessionsRoot, skillPool })) {
        ui.writeln(line);
      }
    }
    return { handled: true };
  }

  const resumeLegacyCommand = parseResumeCommand(trimmed, "/resume-legacy");
  if (resumeLegacyCommand.type !== "none") {
    if (resumeLegacyCommand.type === "error") {
      ui.writeln(`Error: ${resumeLegacyCommand.message.replace("/resume", "/resume-legacy")}`);
    } else {
      for (const line of resumeSessionById(resumeLegacyCommand.id, { runner, sessionState, sessionsRoot, skillPool })) {
        ui.writeln(line.replace("Resumed session:", "Resumed legacy session:"));
      }
    }
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

function writeSessionSaveStatus({ ui, runner, sessionState, sessionSource }) {
  if (sessionSource === "pi") {
    const stats = runner.getSessionStats?.();
    ui.writeln(`Pi session auto-saved: ${stats?.sessionId ?? sessionState.sessionId}`);
    return;
  }
  saveSession(sessionState.sessionDir, runner.engine);
  ui.writeln(`Session saved: ${sessionState.sessionId}`);
}

async function listCurrentPiSessions({ tree, runner, projectMarchDir }) {
  const sessions = await listPiSessionInfos({
    cwd: runner.engine.cwd,
    projectMarchDir,
  });
  const currentPiSessionId = runner.getSessionStats?.().sessionId ?? null;
  return tree
    ? formatPiSessionTree(sessions, currentPiSessionId)
    : formatPiSessionList(sessions);
}
