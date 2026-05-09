import { ROOT_NODE_UUID } from "../memory/database.mjs";

export function buildMemoryLayer({ graph, glossary, turns, namespace, userMessage }) {
  if (!graph) return "";
  const entries = [];
  const seen = new Set();

  if (turns.length === 0) {
    try {
      const bootKids = graph.getChildren(ROOT_NODE_UUID, null, null, namespace);
      for (const kid of bootKids) {
        if (seen.has(kid.child_uuid)) continue;
        const mem = graph.getMemoryByPath(kid.path, kid.domain, namespace);
        if (!mem?.content) continue;
        seen.add(kid.child_uuid);
        entries.push(`--- project://boot/${kid.name} (boot) ---\n${mem.content}`);
      }
    } catch {}
  }

  if (glossary && userMessage) {
    try {
      const matches = glossary.findInContent(userMessage);
      for (const m of matches) {
        if (seen.has(m.node_uuid)) continue;
        seen.add(m.node_uuid);
        const pathRows = graph.getPathsForNode(m.node_uuid, namespace);
        if (pathRows.length === 0) {
          const globalRows = graph.getPathsForNode(m.node_uuid, "global");
          pathRows.push(...globalRows);
        }
        const uri = pathRows.length > 0
          ? `${pathRows[0].domain}://${pathRows[0].path}`
          : `node:${m.node_uuid}`;
        const mem = graph.getCurrentMemory(m.node_uuid);
        if (mem?.content) {
          const truncated = mem.content.length > 800 ? mem.content.slice(0, 800) + "\n...(truncated)" : mem.content;
          entries.push(`--- ${uri} (match) ---\n${truncated}`);
        }
      }
    } catch {}
  }

  try {
    const sessionKids = graph.getChildren(ROOT_NODE_UUID, "current", null, namespace);
    for (const kid of sessionKids) {
      if (seen.has(kid.child_uuid)) continue;
      const mem = graph.getMemoryByPath(kid.path, kid.domain, namespace);
      if (!mem?.content) continue;
      seen.add(kid.child_uuid);
      entries.push(`--- session://current/${kid.name} ---\n${mem.content}`);
    }
  } catch {}

  for (const uuid of seen) {
    try { graph.touchNode(uuid); } catch {}
  }

  if (entries.length === 0) return "";
  return `[memory]\n${entries.join("\n\n")}`;
}
