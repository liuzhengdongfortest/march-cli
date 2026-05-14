import { deleteSubtreePaths, gcEdgeIfPathless, gcNodeSoft } from "./graph-cascades.mjs";
import { escapeLikePath, graphUri } from "./graph-path-utils.mjs";
import { resolveGraphPath } from "./graph-primitives.mjs";

export function removeGraphPath(db, path, domain = "core", namespace = "") {
  if (path === "") throw new Error("Cannot remove root path.");

  const target = resolveGraphPath(db, path, domain, namespace);
  if (!target) throw new Error(`Path '${graphUri(domain, path)}' not found`);

  const targetNodeUuid = target.node_uuid;
  const targetEdge = target.edge;
  if (!targetEdge) throw new Error(`Path '${domain}://${path}' has no edge.`);

  const wouldOrphan = findWouldOrphanChildren(db, { path, domain, namespace, targetNodeUuid });
  if (wouldOrphan.length > 0) {
    const details = wouldOrphan.map(e => `'${e.name}' (${e.child_uuid.slice(0, 8)}...)`).join(", ");
    throw new Error(`Cannot remove '${graphUri(domain, path)}': children would become unreachable: ${details}`);
  }

  deleteSubtreePaths(db, domain, path, namespace);
  gcEdgeIfPathless(db, targetEdge);
  gcNodeSoft(db, targetNodeUuid);
  return { deleted: graphUri(domain, path) };
}

function findWouldOrphanChildren(db, { path, domain, namespace, targetNodeUuid }) {
  const childEdges = db.prepare("SELECT * FROM edges WHERE parent_uuid = ?").all(targetNodeUuid);
  const wouldOrphan = [];
  const safe = escapeLikePath(path);

  for (const childEdge of childEdges) {
    const surviving = db.prepare(`
      SELECT COUNT(*) AS cnt FROM paths
      WHERE node_uuid = ?
      AND NOT (domain = ? AND (path = ? OR path LIKE ? ESCAPE '\\'))
    `).get(childEdge.child_uuid, domain, path, `${safe}/%`);
    if (surviving.cnt > 0) continue;

    const targetSurviving = db.prepare(`
      SELECT * FROM paths
      WHERE node_uuid = ? AND namespace = ?
      AND NOT (domain = ? AND (path = ? OR path LIKE ? ESCAPE '\\'))
      ORDER BY CASE WHEN domain = ? THEN 0 ELSE 1 END, path
      LIMIT 1
    `).get(targetNodeUuid, namespace, domain, path, `${safe}/%`, domain);
    if (!targetSurviving) wouldOrphan.push(childEdge);
  }
  return wouldOrphan;
}
