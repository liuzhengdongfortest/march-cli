import { saveSession, listSessions, forkSession } from "../session/persist.mjs";
import { formatSessionTree } from "../session/tree.mjs";
import { handleModelCommand, listModels, parseModelCommand } from "./model-command.mjs";
import { formatHotkeysPanel } from "./repl-commands.mjs";
import { compactSession, listSessionStats } from "./session-command.mjs";
import { handleThinkingCommand, parseThinkingCommand } from "./thinking-command.mjs";

export async function handleSlashCommand(trimmed, {
  ui,
  runner,
  sessionState,
  sessionsRoot,
}) {
  if (trimmed === "/exit" || trimmed === "/quit") {
    saveSession(sessionState.sessionDir, runner.engine);
    ui.writeln(`Session saved: ${sessionState.sessionId}`);
    return { handled: true, exit: true };
  }

  if (trimmed === "/help") {
    ui.writeln("Commands: /exit, /help, /hotkeys, /model, /models, /compact, /session, /sessions, /sessions tree, /fork, /status, /save, /mouse, /pin <path>, /unpin <path>, /pins");
    ui.writeln("Shortcuts: Esc = abort turn, Ctrl+O = toggle tool output, Ctrl+G = external editor, Shift+Tab/Ctrl+T = thinking level, Ctrl+L = model");
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
    const forked = forkSession(sessionsRoot, sessionState.sessionId, runner.engine);
    sessionState.sessionId = forked.id;
    sessionState.sessionDir = forked.sessionDir;
    ui.writeln(`Forked session: ${sessionState.sessionId} (parent: ${forked.state.parentSessionId})`);
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
    const sessions = listSessions(sessionsRoot);
    if (trimmed === "/sessions tree") {
      for (const line of formatSessionTree(sessions, sessionState.sessionId)) ui.writeln(line);
      return { handled: true };
    }
    if (sessions.length === 0) {
      ui.writeln("(no saved sessions)");
    } else {
      for (const s of sessions) {
        const marker = s.id === sessionState.sessionId ? " *" : "  ";
        const parent = s.parentSessionId ? `  fork:${s.parentSessionId}` : "";
        ui.writeln(`${marker} ${s.id}  ${s.turnCount}t  ${s.cwd}  ${s.savedAt?.slice(0, 19) ?? "?"}${parent}`);
      }
      ui.writeln("(* = current session)");
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
