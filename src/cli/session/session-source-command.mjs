import { listPiSessionInfos } from "../../session/pi-manager.mjs";
import { loadPiSessionTranscriptTurns } from "../../session/transcript.mjs";
import { resumePiSessionById } from "./pi-session-switch-command.mjs";

export async function handleSessionSourceCommand(trimmed, {
  ui,
  runner,
  sessionState,
  sessionsRoot,
  projectMarchDir,
}) {
  if (trimmed === "/save") {
    const stats = runner.getSessionStats?.();
    ui.writeln(`Pi session auto-saved: ${stats?.sessionId ?? sessionState.sessionId}`);
    return { handled: true };
  }

  if (trimmed === "/session") {
    const sessions = await listPiSessionInfos({
      cwd: runner.engine.cwd,
      projectMarchDir,
    });
    if (sessions.length === 0) {
      ui.writeln("No previous sessions.");
      return { handled: true };
    }
    if (!ui.selectList) {
      ui.writeln("Session selector is only available in TUI.");
      return { handled: true };
    }
    const currentSessionId = runner.getSessionStats?.().sessionId ?? null;
    const item = await ui.selectList({
      items: buildSessionSelectItems(sessions, currentSessionId),
      selectedIndex: Math.max(0, sessions.findIndex((session) => session.id === currentSessionId)),
      width: 72,
      suppressInitialConfirm: true,
      searchable: true,
      getSearchText: sessionSelectSearchText,
    });
    if (!item) {
      ui.writeln("Session unchanged.");
      return { handled: true };
    }
    const lines = await resumePiSessionById(item.session.id, { runner, sessions, projectMarchDir });
    if (isResumeSuccess(lines)) restoreTranscriptFromSession(item.session, ui);
    for (const line of lines) {
      ui.writeln(line);
    }
    return { handled: true };
  }

  return { handled: false };
}

export function buildSessionSelectItems(sessions, currentSessionId = null) {
  return sessions.map((session) => {
    const label = session.name || session.firstMessage || "(no messages)";
    const savedAt = formatSessionSelectTime(session.savedAt);
    return {
      value: session.id,
      label,
      description: savedAt,
      session,
    };
  });
}

function sessionSelectSearchText(item) {
  const session = item?.session;
  return `${item?.label ?? ""} ${item?.description ?? ""} ${session?.id ?? ""} ${session?.name ?? ""} ${session?.firstMessage ?? ""} ${session?.turnCount ?? ""}`;
}

function restoreTranscriptFromSession(session, ui) {
  if (typeof ui.restoreTranscript !== "function") return;
  try {
    ui.restoreTranscript(loadPiSessionTranscriptTurns(session.path));
  } catch (err) {
    ui.writeln(`Warning: failed to restore session transcript: ${err.message}`);
  }
}

function isResumeSuccess(lines) {
  return Array.isArray(lines) && lines.some((line) => String(line).startsWith("Resumed pi session:"));
}

function formatSessionSelectTime(value) {
  if (!value) return "?";
  return String(value).slice(0, 16).replace("T", " ");
}
