import { formatSessionTree } from "../session/tree.mjs";

export function formatSessionList(sessions, currentSessionId = null) {
  if (sessions.length === 0) return ["(no saved sessions)"];
  const lines = sessions.map((session) => {
    const marker = session.id === currentSessionId ? " *" : "  ";
    const parent = session.parentSessionId ? `  fork:${session.parentSessionId}` : "";
    return `${marker} ${session.id}  ${session.turnCount}t  ${session.cwd}  ${session.savedAt?.slice(0, 19) ?? "?"}${parent}`;
  });
  lines.push("(* = current session)");
  return lines;
}

export function listSessionCommand({ sessions, currentSessionId, tree = false }) {
  if (tree) return formatSessionTree(sessions, currentSessionId);
  return formatSessionList(sessions, currentSessionId);
}

export function formatPiSessionList(sessions) {
  if (sessions.length === 0) return ["(no pi sessions)"];
  const lines = sessions.map((session) => {
    const label = session.name || session.firstMessage || "(no messages)";
    const savedAt = session.savedAt?.slice(0, 19) ?? "?";
    return `  ${session.id}  ${session.turnCount}m  ${savedAt}  ${label}`;
  });
  lines.push("(pi JSONL sessions; write with --pi-sessions, resume with /resume-pi <id> under --pi-runtime-host)");
  return lines;
}
