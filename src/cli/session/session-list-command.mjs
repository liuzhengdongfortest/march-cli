import { formatSessionTree } from "../../session/tree.mjs";

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
  lines.push("(pi JSONL session files; /sessions tree shows file-level parentSessionPath only, not in-file entry branches; resume with /resume <id>)");
  return lines;
}

export function formatPiSessionTree(sessions, currentSessionId = null) {
  if (sessions.length === 0) return ["(no pi sessions)"];

  const nodes = new Map();
  const byPath = new Map();
  for (const session of sessions) {
    const node = { ...session, children: [] };
    nodes.set(session.id, node);
    if (session.path) byPath.set(session.path, node);
  }

  const roots = [];
  for (const node of nodes.values()) {
    const parent = node.parentSessionPath ? byPath.get(node.parentSessionPath) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  const bySavedAtDesc = (a, b) => (b.savedAt ?? "").localeCompare(a.savedAt ?? "");
  const sortDeep = (items) => {
    items.sort(bySavedAtDesc);
    for (const item of items) sortDeep(item.children);
  };
  sortDeep(roots);

  const lines = [];
  const visit = (node, depth) => {
    const marker = node.id === currentSessionId ? "*" : "-";
    const savedAt = node.savedAt?.slice(0, 19) ?? "?";
    const label = node.name || node.firstMessage || "(no messages)";
    const indent = "  ".repeat(depth);
    lines.push(`${indent}${marker} ${node.id}  ${node.turnCount ?? 0}m  ${savedAt}  ${label}`);
    for (const child of node.children) visit(child, depth + 1);
  };

  for (const root of roots) visit(root, 0);
  lines.push("(* = current pi session; file-level tree uses pi JSONL parentSessionPath; in-file entry branches use /session entries or /fork-pi)");
  return lines;
}
