import { ROOT_NODE_UUID } from "./database.mjs";
import { escapeLikePath } from "./graph-path-utils.mjs";
import {
  countPathsForEdge,
  insertPath,
} from "./graph-primitives.mjs";

export function deprecateNodeMemories(db, nodeUuid, successorId = null) {
  const conditions = ["node_uuid = ?", "deprecated = 0"];
  const params = [nodeUuid];
  if (successorId !== null) {
    conditions.push("id != ?");
    params.push(successorId);
  }
  const ids = db.prepare(
    `SELECT id FROM memories WHERE ${conditions.join(" AND ")}`
  ).all(...params).map(r => r.id);

  if (ids.length > 0) {
    const placeholders = ids.map(() => "?").join(",");
    db.prepare(
      `UPDATE memories SET deprecated = 1, migrated_to = ? WHERE id IN (${placeholders})`
    ).run(successorId, ...ids);
  }
  return ids;
}

export function cascadeCreatePaths(db, nodeUuid, domain, basePath, namespace = "", visited = new Set()) {
  if (visited.has(nodeUuid)) return;
  visited.add(nodeUuid);
  try {
    const childEdges = db.prepare(
      "SELECT * FROM edges WHERE parent_uuid = ?"
    ).all(nodeUuid);
    for (const edge of childEdges) {
      const childPath = `${basePath}/${edge.name}`;
      insertPath(db, namespace, domain, childPath, edge.id, edge.child_uuid);
      cascadeCreatePaths(db, edge.child_uuid, domain, childPath, namespace, visited);
    }
  } finally {
    visited.delete(nodeUuid);
  }
}

export function deleteSubtreePaths(db, domain, path, namespace = "") {
  const safe = escapeLikePath(path);
  const rows = db.prepare(`
    SELECT namespace, domain, path, edge_id, node_uuid
    FROM paths
    WHERE namespace = ? AND domain = ? AND (path = ? OR path LIKE ? ESCAPE '\\')
  `).all(namespace, domain, path, `${safe}/%`);

  for (const row of rows) {
    db.prepare(
      "DELETE FROM paths WHERE namespace = ? AND domain = ? AND path = ?"
    ).run(row.namespace, row.domain, row.path);
  }
  return rows;
}

export function cascadeDeleteEdge(db, edge) {
  const edgePaths = db.prepare(
    "SELECT * FROM paths WHERE edge_id = ?"
  ).all(edge.id);

  for (const path of edgePaths) {
    deleteSubtreePaths(db, path.domain, path.path, path.namespace);
  }
  db.prepare("DELETE FROM edges WHERE id = ?").run(edge.id);
}

export function cascadeDeleteNode(db, nodeUuid) {
  if (nodeUuid === ROOT_NODE_UUID) return null;

  const edges = db.prepare(
    "SELECT * FROM edges WHERE parent_uuid = ? OR child_uuid = ?"
  ).all(nodeUuid, nodeUuid);
  for (const edge of edges) {
    cascadeDeleteEdge(db, edge);
  }

  db.prepare("DELETE FROM memories WHERE node_uuid = ?").run(nodeUuid);
  db.prepare("DELETE FROM glossary_keywords WHERE node_uuid = ?").run(nodeUuid);
  db.prepare("DELETE FROM nodes WHERE uuid = ?").run(nodeUuid);
  return { deleted: nodeUuid };
}

export function gcEdgeIfPathless(db, edge) {
  if (countPathsForEdge(db, edge.id) > 0) return null;
  db.prepare("DELETE FROM edges WHERE id = ?").run(edge.id);
  return { edge_id: edge.id, parent_uuid: edge.parent_uuid, child_uuid: edge.child_uuid };
}

export function gcNodeSoft(db, nodeUuid) {
  if (nodeUuid === ROOT_NODE_UUID) return;

  const row = db.prepare(
    "SELECT COUNT(*) AS cnt FROM paths WHERE node_uuid = ?"
  ).get(nodeUuid);
  if (row.cnt > 0) return;

  const incoming = db.prepare("SELECT * FROM edges WHERE child_uuid = ?").all(nodeUuid);
  for (const edge of incoming) gcEdgeIfPathless(db, edge);

  const outgoing = db.prepare("SELECT * FROM edges WHERE parent_uuid = ?").all(nodeUuid);
  for (const edge of outgoing) cascadeDeleteEdge(db, edge);

  deprecateNodeMemories(db, nodeUuid);
}
