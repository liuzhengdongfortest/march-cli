import { ROOT_NODE_UUID } from "./database.mjs";

export function ensureNode(db, nodeUuid) {
  const existing = db.prepare("SELECT uuid FROM nodes WHERE uuid = ?").get(nodeUuid);
  if (!existing) {
    db.prepare("INSERT INTO nodes (uuid) VALUES (?)").run(nodeUuid);
  }
  return nodeUuid;
}

export function insertMemory(db, nodeUuid, content, deprecated = false) {
  const result = db.prepare(
    "INSERT INTO memories (node_uuid, content, deprecated) VALUES (?, ?, ?)"
  ).run(nodeUuid, content, deprecated ? 1 : 0);
  return { id: Number(result.lastInsertRowid), node_uuid: nodeUuid, content, deprecated: deprecated ? 1 : 0 };
}

export function getOrCreateEdge(db, parentUuid, childUuid, name, priority = 0, disclosure = null) {
  const existing = db.prepare(
    "SELECT id, parent_uuid, child_uuid, name, priority, disclosure FROM edges WHERE parent_uuid = ? AND child_uuid = ?"
  ).get(parentUuid, childUuid);

  if (existing) return { edge: existing, created: false };

  const result = db.prepare(
    "INSERT INTO edges (parent_uuid, child_uuid, name, priority, disclosure) VALUES (?, ?, ?, ?, ?)"
  ).run(parentUuid, childUuid, name, priority, disclosure);
  const edge = {
    id: Number(result.lastInsertRowid), parent_uuid: parentUuid, child_uuid: childUuid,
    name, priority, disclosure,
  };
  return { edge, created: true };
}

export function insertPath(db, namespace, domain, path, edgeId, nodeUuid) {
  db.prepare(
    "INSERT OR IGNORE INTO paths (namespace, domain, path, edge_id, node_uuid) VALUES (?, ?, ?, ?, ?)"
  ).run(namespace, domain, path, edgeId, nodeUuid);
}

export function resolveGraphPath(db, path, domain = "core", namespace = "") {
  if (path === "") {
    return { node_uuid: ROOT_NODE_UUID, edge: null, path_obj: null };
  }
  const row = db.prepare(`
    SELECT p.namespace, p.domain, p.path, p.edge_id, p.node_uuid,
           e.parent_uuid, e.child_uuid, e.name, e.priority, e.disclosure
    FROM paths p
    JOIN edges e ON p.edge_id = e.id
    WHERE p.namespace = ? AND p.domain = ? AND p.path = ?
  `).get(namespace, domain, path);

  if (!row) return null;
  return {
    path_obj: { namespace: row.namespace, domain: row.domain, path: row.path, edge_id: row.edge_id, node_uuid: row.node_uuid },
    edge: { id: row.edge_id, parent_uuid: row.parent_uuid, child_uuid: row.child_uuid, name: row.name, priority: row.priority, disclosure: row.disclosure },
    node_uuid: row.node_uuid,
  };
}

export function countPathsForEdge(db, edgeId) {
  const row = db.prepare("SELECT COUNT(*) AS cnt FROM paths WHERE edge_id = ?").get(edgeId);
  return row.cnt;
}

export function countMemoriesForNode(db, nodeUuid) {
  const row = db.prepare("SELECT COUNT(*) AS cnt FROM memories WHERE node_uuid = ?").get(nodeUuid);
  return row.cnt;
}

export function getNextChildNumber(db, parentUuid, namespace) {
  const rows = db.prepare(`
    SELECT e.name FROM edges e
    JOIN paths p ON p.edge_id = e.id
    WHERE e.parent_uuid = ? AND p.namespace = ?
  `).all(parentUuid, namespace);
  let maxNum = 0;
  for (const row of rows) {
    const num = parseInt(row.name, 10);
    if (!Number.isNaN(num) && num > maxNum) maxNum = num;
  }
  return maxNum + 1;
}

export function wouldCreateCycle(db, parentUuid, childUuid) {
  if (parentUuid === ROOT_NODE_UUID) return false;
  if (parentUuid === childUuid) return true;

  const visited = new Set([childUuid]);
  const queue = [childUuid];
  while (queue.length > 0) {
    const current = queue.shift();
    const rows = db.prepare("SELECT child_uuid FROM edges WHERE parent_uuid = ?").all(current);
    for (const row of rows) {
      if (row.child_uuid === parentUuid) return true;
      if (!visited.has(row.child_uuid)) {
        visited.add(row.child_uuid);
        queue.push(row.child_uuid);
      }
    }
  }
  return false;
}
