import { ROOT_NODE_UUID } from "../database.mjs";

export function getGraphDiagnostics(db, namespace = "", daysStale = 30, maxChildren = 10) {
  const cutoff = new Date(Date.now() - daysStale * 86400000).toISOString();

  const allRows = db.prepare(`
    SELECT p.domain, p.path, p.node_uuid, n.created_at, n.last_accessed_at,
           e.priority, m.id AS memory_id
    FROM paths p
    JOIN edges e ON p.edge_id = e.id
    JOIN nodes n ON n.uuid = e.child_uuid
    JOIN memories m ON m.node_uuid = n.uuid AND m.deprecated = 0
    WHERE p.namespace = ?
  `).all(namespace);

  const staleNodes = {};
  for (const row of allRows) {
    const effective = row.last_accessed_at ?? row.created_at ?? cutoff;
    if (effective >= cutoff) continue;
    const staleDays = Math.round((Date.now() - new Date(effective).getTime()) / 86400000);
    const key = row.node_uuid;
    if (!staleNodes[key] || (row.priority ?? 999) < (staleNodes[key].priority ?? 999)) {
      staleNodes[key] = {
        uuid: row.node_uuid,
        uri: `${row.domain}://${row.path}`,
        created_at: row.created_at,
        last_accessed_at: row.last_accessed_at,
        stale_days: staleDays,
        priority: row.priority,
        title: row.path.split("/").pop(),
        memory_id: row.memory_id,
      };
    }
  }

  const crowdedRows = db.prepare(`
    SELECT e.parent_uuid, COUNT(DISTINCT e.child_uuid) AS child_count
    FROM edges e
    JOIN paths p ON p.edge_id = e.id
    WHERE p.namespace = ?
    GROUP BY e.parent_uuid
    HAVING child_count > ?
  `).all(namespace, maxChildren);

  const crowdedParents = {};
  for (const row of crowdedRows) {
    if (row.parent_uuid === ROOT_NODE_UUID) {
      crowdedParents[row.parent_uuid] = {
        uuid: row.parent_uuid,
        uri: "core://",
        title: "(root)",
        child_count: row.child_count,
      };
    } else {
      const p = db.prepare(
        "SELECT domain, path FROM paths WHERE node_uuid = ? AND namespace = ? LIMIT 1"
      ).get(row.parent_uuid, namespace);
      if (p) {
        crowdedParents[row.parent_uuid] = {
          uuid: row.parent_uuid,
          uri: `${p.domain}://${p.path}`,
          title: p.path.split("/").pop(),
          child_count: row.child_count,
        };
      }
    }
  }

  return {
    stale_nodes: Object.values(staleNodes).sort((a, b) => (a.last_accessed_at ?? a.created_at ?? "").localeCompare(b.last_accessed_at ?? b.created_at ?? "")),
    crowded_nodes: Object.values(crowdedParents).sort((a, b) => b.child_count - a.child_count),
  };
}
