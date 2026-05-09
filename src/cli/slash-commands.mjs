import { saveSession, listSessions, forkSession } from "../session/persist.mjs";
import { listPiSessionInfos } from "../session/pi-manager.mjs";
import { handleModelCommand, listModels, parseModelCommand } from "./model-command.mjs";
import { clonePiSession, parseClonePiCommand } from "./pi-session-clone-command.mjs";
import { forkPiSessionResetContext, listPiForkCandidates, parseForkPiCommand } from "./pi-session-fork-command.mjs";
import { parseResumePiCommand, resumePiSessionById } from "./pi-session-switch-command.mjs";
import { formatHotkeysPanel } from "./repl-commands.mjs";
import { compactSession, listSessionStats } from "./session-command.mjs";
import { formatPiSessionList, formatPiSessionTree, listSessionCommand } from "./session-list-command.mjs";
import { parseResumeCommand, resumeSessionById } from "./session-switch-command.mjs";
import { handleThinkingCommand, parseThinkingCommand } from "./thinking-command.mjs";

export async function handleSlashCommand(trimmed, {
  ui,
  runner,
  sessionState,
  sessionsRoot,
  projectMarchDir,
  skillPool = [],
  sessionSource = "legacy",
}) {
  if (trimmed === "/exit" || trimmed === "/quit") {
    saveSession(sessionState.sessionDir, runner.engine);
    ui.writeln(`Session saved: ${sessionState.sessionId}`);
    return { handled: true, exit: true };
  }

  if (trimmed === "/help") {
    ui.writeln("Commands: /exit, /help, /hotkeys, /model, /models, /compact, /session, /sessions, /sessions tree, /sessions pi, /sessions legacy, /resume <id>, /resume-pi <id>, /resume-legacy <id>, /clone-pi, /fork-pi, /fork, /fork-legacy, /status, /save, /mouse, /pin <path>, /unpin <path>, /pins");
    ui.writeln("Shortcuts: Esc = abort turn, Ctrl+O = toggle tool output, Ctrl+G = external editor, Shift+Tab = cycle thinking, Ctrl+T = thinking selector, Ctrl+L = model selector");
    return { handled: true };
  }

  if (trimmed === "/hotkeys") {
    for (const line of formatHotkeysPanel()) ui.writeln(line);
    return { handled: true };
  }

  const thinkingCommand = parseThinkingCommand(trimmed);
  if (thinkingCommand.type !== "none") {
    for (const line of handleThinkingCommand(thinkingCommand, { runner })) ui.writeln(line);
    return { handled: true };
  }

  if (trimmed === "/mouse") {
    const on = ui.toggleMouse();
    ui.writeln(on ? "Mouse tracking: ON (click-to-expand enabled, text selection disabled)" : "Mouse tracking: OFF (text selection enabled)");
    return { handled: true };
  }

  if (trimmed === "/status") {
    const s = runner.engine;
    ui.writeln(`session: ${sessionState.sessionId}  model: ${s.modelId}  turns: ${s.turns.length}  open: ${s.openFiles.size}  skills: ${s.skills.map(s => typeof s === "string" ? s : s.name).join(", ") || "(none)"}  pins: ${s.getPins().join(", ") || "(none)"}`);
    return { handled: true };
  }

  if (trimmed === "/save") {
    saveSession(sessionState.sessionDir, runner.engine);
    ui.writeln(`Session saved: ${sessionState.sessionId}`);
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

  if (trimmed.startsWith("/pin ")) {
    const raw = trimmed.slice(5).trim();
    const absPath = runner.engine.resolvePath(raw);
    runner.engine.addPin(absPath);
    if (!runner.engine.isOpen(absPath)) {
      try {
        runner.engine.openFile(absPath);
      } catch {
        // File can't be opened yet — just pin it
      }
    }
    ui.writeln(`Pinned: ${absPath}`);
    return { handled: true };
  }

  if (trimmed === "/pins") {
    const pins = runner.engine.getPins();
    ui.writeln(pins.length > 0 ? pins.join("\n") : "(no pinned files)");
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

  if (trimmed.startsWith("/unpin ")) {
    const raw = trimmed.slice(7).trim();
    const absPath = runner.engine.resolvePath(raw);
    runner.engine.removePin(absPath);
    ui.writeln(`Unpinned: ${absPath}`);
    return { handled: true };
  }

  const modelCommand = parseModelCommand(trimmed);
  if (modelCommand.type !== "none") {
    try {
      ui.writeln(await handleModelCommand(modelCommand, { runner }));
    } catch (err) {
      ui.writeln(`Error: ${err.message}`);
    }
    return { handled: true };
  }

  if (trimmed === "/models") {
    for (const line of listModels({ runner })) ui.writeln(line);
    return { handled: true };
  }

  if (trimmed === "/compact") {
    for (const line of await compactSession({ runner })) ui.writeln(line);
    return { handled: true };
  }

  if (trimmed === "/session") {
    for (const line of listSessionStats({ runner })) ui.writeln(line);
    return { handled: true };
  }

  return { handled: false };
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
