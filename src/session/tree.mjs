export function buildSessionTree(sessions) {
  const nodes = new Map();
  for (const session of sessions) {
    nodes.set(session.id, { ...session, children: [] });
  }

  const roots = [];
  for (const node of nodes.values()) {
    const parent = node.parentSessionId ? nodes.get(node.parentSessionId) : null;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const bySavedAtDesc = (a, b) => (b.savedAt ?? "").localeCompare(a.savedAt ?? "");
  const sortDeep = (items) => {
    items.sort(bySavedAtDesc);
    for (const item of items) sortDeep(item.children);
  };
  sortDeep(roots);
  return roots;
}

export function formatSessionTree(sessions, currentSessionId = null) {
  const roots = buildSessionTree(sessions);
  if (roots.length === 0) return ["(no saved sessions)"];

  const lines = [];
  const visit = (node, depth) => {
    const marker = node.id === currentSessionId ? "*" : "-";
    const savedAt = node.savedAt?.slice(0, 19) ?? "?";
    const indent = "  ".repeat(depth);
    lines.push(`${indent}${marker} ${node.id}  ${node.turnCount ?? 0}t  ${savedAt}`);
    for (const child of node.children) visit(child, depth + 1);
  };

  for (const root of roots) visit(root, 0);
  lines.push("(* = current session)");
  return lines;
}
