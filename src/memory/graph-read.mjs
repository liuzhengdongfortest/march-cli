import { ROOT_NODE_UUID } from "./database.mjs";

export function getMemoryByPath(db, path, domain = "core", namespace = "") {
  if (path === "") {
    return {
      id: 0, node_uuid: ROOT_NODE_UUID,
      content: `Root node for domain '${domain}'.`,
      priority: 0, disclosure: null, deprecated: false,
      created_at: null, domain, path: "", alias_count: 0,
    };
  }

  const row = db.prepare(`
    SELECT m.id, m.node_uuid, m.content, m.deprecated, m.created_at,
           e.priority, e.disclosure, p.domain, p.path
    FROM paths p
    JOIN edges e ON p.edge_id = e.id
    JOIN memories m ON m.node_uuid = e.child_uuid AND m.deprecated = 0
    WHERE p.namespace = ? AND p.domain = ? AND p.path = ?
    ORDER BY m.created_at DESC
    LIMIT 1
  `).get(namespace, domain, path);

  if (!row) return null;

  const totalPaths = countIncomingPaths(db, row.node_uuid, namespace);
  const aliasCount = Math.max(0, totalPaths - 1);

  return {
    id: row.id, node_uuid: row.node_uuid, content: row.content,
    priority: row.priority, disclosure: row.disclosure,
    deprecated: !!row.deprecated, created_at: row.created_at,
    domain: row.domain, path: row.path, alias_count: aliasCount,
  };
}

export function getChildren(db, nodeUuid = ROOT_NODE_UUID, contextDomain = null, contextPath = null, namespace = "") {
  const rows = db.prepare(`
    SELECT DISTINCT e.id AS edge_id, e.child_uuid, e.name, e.priority, e.disclosure,
           m.content, m.id AS memory_id
    FROM edges e
    JOIN paths p ON p.edge_id = e.id
    JOIN memories m ON m.node_uuid = e.child_uuid AND m.deprecated = 0
    WHERE e.parent_uuid = ? AND p.namespace = ?
    ORDER BY e.priority ASC, e.name
  `).all(nodeUuid, namespace);

  const childUuids = [...new Set(rows.map(r => r.child_uuid))];
  const edgeIds = [...new Set(rows.map(r => r.edge_id))];

  const approxChildrenMap = {};
  if (childUuids.length > 0) {
    const placeholders = childUuids.map(() => "?").join(",");
    const counts = db.prepare(`
      SELECT e.parent_uuid, COUNT(DISTINCT e.id)
      FROM edges e
      JOIN paths p ON p.edge_id = e.id
      WHERE e.parent_uuid IN (${placeholders}) AND p.namespace = ?
      GROUP BY e.parent_uuid
    `).all(...childUuids, namespace);
    for (const c of counts) {
      approxChildrenMap[c[0]] = c[1];
    }
  }

  const pathsByEdgeId = {};
  if (edgeIds.length > 0) {
    const placeholders = edgeIds.map(() => "?").join(",");
    const pathRows = db.prepare(`
      SELECT * FROM paths WHERE namespace = ? AND edge_id IN (${placeholders})
    `).all(namespace, ...edgeIds);
    for (const p of pathRows) {
      if (!pathsByEdgeId[p.edge_id]) pathsByEdgeId[p.edge_id] = [];
      pathsByEdgeId[p.edge_id].push(p);
    }
  }

  const prefix = contextPath ? `${contextPath}/` : null;
  const seen = new Set();
  const children = [];

  for (const row of rows) {
    if (seen.has(row.child_uuid)) continue;
    seen.add(row.child_uuid);

    const allPaths = pathsByEdgeId[row.edge_id] ?? [];
    if (nodeUuid === ROOT_NODE_UUID && contextDomain) {
      if (!allPaths.some(p => p.domain === contextDomain)) continue;
    }

    const pathObj = pickBestPath(allPaths, contextDomain, prefix);
    if (!pathObj) continue;

    children.push({
      node_uuid: row.child_uuid,
      edge_id: row.edge_id,
      name: row.name,
      domain: pathObj.domain,
      path: pathObj.path,
      content_snippet: (row.content ?? "").slice(0, 100) + ((row.content ?? "").length > 100 ? "..." : ""),
      priority: row.priority,
      disclosure: row.disclosure,
      approx_children_count: approxChildrenMap[row.child_uuid] ?? 0,
    });
  }

  return children;
}

export function getRecentMemories(db, limit = 10, namespace = "") {
  const rows = db.prepare(`
    SELECT m.id AS memory_id, m.created_at, e.priority, e.disclosure, p.domain, p.path
    FROM paths p
    JOIN edges e ON p.edge_id = e.id
    JOIN memories m ON m.node_uuid = e.child_uuid AND m.deprecated = 0
    WHERE p.namespace = ?
    ORDER BY m.created_at DESC
  `).all(namespace);

  const seen = new Set();
  const memories = [];
  for (const row of rows) {
    if (seen.has(row.memory_id)) continue;
    seen.add(row.memory_id);
    memories.push({
      memory_id: row.memory_id,
      uri: `${row.domain}://${row.path}`,
      priority: row.priority,
      disclosure: row.disclosure,
      created_at: row.created_at,
    });
    if (memories.length >= limit) break;
  }
  return memories;
}

function countIncomingPaths(db, nodeUuid, namespace = "") {
  const row = db.prepare(
    "SELECT COUNT(*) AS cnt FROM paths WHERE node_uuid = ? AND namespace = ?"
  ).get(nodeUuid, namespace);
  return row.cnt;
}

function pickBestPath(paths, contextDomain, prefix) {
  if (paths.length === 0) return null;
  if (paths.length === 1) return paths[0];

  if (contextDomain && prefix) {
    for (const p of paths) {
      if (p.domain === contextDomain && p.path.startsWith(prefix)) return p;
    }
  }
  if (contextDomain) {
    for (const p of paths) {
      if (p.domain === contextDomain) return p;
    }
  }
  return paths[0];
}
