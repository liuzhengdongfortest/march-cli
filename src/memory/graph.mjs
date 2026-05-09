import { randomUUID } from "node:crypto";
import { ROOT_NODE_UUID } from "./database.mjs";
import {
  getChildren,
  getMemoryByPath,
  getRecentMemories,
} from "./graph-read.mjs";
import { getGraphDiagnostics } from "./graph-diagnostics.mjs";
import {
  escapeLikePath,
  graphUri,
  leafName,
  pathExists,
} from "./graph-path-utils.mjs";
import {
  countMemoriesForNode,
  countPathsForEdge,
  ensureNode,
  getNextChildNumber,
  getOrCreateEdge,
  insertMemory,
  insertPath,
  resolveGraphPath,
  wouldCreateCycle,
} from "./graph-primitives.mjs";

export class GraphService {
  constructor(db, { changesetStore = null, searchIndexer = null, namespace = "" } = {}) {
    this.db = db;
    this.changesetStore = changesetStore;
    this.searchIndexer = searchIndexer;
    this.namespace = namespace;
  }

  /**
   * Resolve namespace: explicit arg takes precedence, then instance default.
   */
  #ns(explicit = undefined) {
    return explicit !== undefined ? explicit : this.namespace;
  }

  // ═══════════════════════════════════════════════════════════════════
  // Read Operations
  // ═══════════════════════════════════════════════════════════════════

  getMemoryByPath(path, domain = "core", namespace = "") {
    return getMemoryByPath(this.db, path, domain, namespace);
  }

  getChildren(nodeUuid = ROOT_NODE_UUID, contextDomain = null, contextPath = null, namespace = "") {
    return getChildren(this.db, nodeUuid, contextDomain, contextPath, this.#ns(namespace));
  }

  getRecentMemories(limit = 10, namespace = "") {
    return getRecentMemories(this.db, limit, namespace);
  }

  resolvePath(path, domain = "core", namespace = "") {
    return resolveGraphPath(this.db, path, domain, namespace);
  }

  getPathsForNode(nodeUuid, namespace = "") {
    return this.db.prepare(
      "SELECT * FROM paths WHERE node_uuid = ? AND namespace = ?"
    ).all(nodeUuid, namespace);
  }

  getCurrentMemory(nodeUuid) {
    return this.db.prepare(
      "SELECT * FROM memories WHERE node_uuid = ? AND deprecated = 0 ORDER BY id DESC LIMIT 1"
    ).get(nodeUuid);
  }

  touchNode(nodeUuid) {
    this.db.prepare(
      "UPDATE nodes SET last_accessed_at = datetime('now') WHERE uuid = ?"
    ).run(nodeUuid);
  }

  getDiagnostics(namespace = "", daysStale = 30, maxChildren = 10) {
    return getGraphDiagnostics(this.db, namespace, daysStale, maxChildren);
  }

  // ═══════════════════════════════════════════════════════════════════
  // Layer 1: Table-Scoped Operations
  // ═══════════════════════════════════════════════════════════════════

  #deprecateNodeMemories(nodeUuid, successorId = null) {
    const conditions = ["node_uuid = ?", "deprecated = 0"];
    const params = [nodeUuid];
    if (successorId !== null) {
      conditions.push("id != ?");
      params.push(successorId);
    }
    const ids = this.db.prepare(
      `SELECT id FROM memories WHERE ${conditions.join(" AND ")}`
    ).all(...params).map(r => r.id);

    if (ids.length > 0) {
      const placeholders = ids.map(() => "?").join(",");
      this.db.prepare(
        `UPDATE memories SET deprecated = 1, migrated_to = ? WHERE id IN (${placeholders})`
      ).run(successorId, ...ids);
    }
    return ids;
  }

  #cascadeCreatePaths(nodeUuid, domain, basePath, namespace = "", visited = new Set()) {
    if (visited.has(nodeUuid)) return;
    visited.add(nodeUuid);
    try {
      const childEdges = this.db.prepare(
        "SELECT * FROM edges WHERE parent_uuid = ?"
      ).all(nodeUuid);
      for (const edge of childEdges) {
        const childPath = `${basePath}/${edge.name}`;
        insertPath(this.db, namespace, domain, childPath, edge.id, edge.child_uuid);
        this.#cascadeCreatePaths(edge.child_uuid, domain, childPath, namespace, visited);
      }
    } finally {
      visited.delete(nodeUuid);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // Layer 2: Cross-Table Cascades
  // ═══════════════════════════════════════════════════════════════════

  #deleteSubtreePaths(domain, path, namespace = "") {
    const safe = escapeLikePath(path);
    const rows = this.db.prepare(`
      SELECT namespace, domain, path, edge_id, node_uuid
      FROM paths
      WHERE namespace = ? AND domain = ? AND (path = ? OR path LIKE ? ESCAPE '\\')
    `).all(namespace, domain, path, `${safe}/%`);

    for (const row of rows) {
      this.db.prepare(
        "DELETE FROM paths WHERE namespace = ? AND domain = ? AND path = ?"
      ).run(row.namespace, row.domain, row.path);
    }
    return rows;
  }

  #cascadeDeleteEdge(edge) {
    const edgePaths = this.db.prepare(
      "SELECT * FROM paths WHERE edge_id = ?"
    ).all(edge.id);

    for (const p of edgePaths) {
      this.#deleteSubtreePaths(p.domain, p.path, p.namespace);
    }
    this.db.prepare("DELETE FROM edges WHERE id = ?").run(edge.id);
  }

  cascadeDeleteNode(nodeUuid) {
    if (nodeUuid === ROOT_NODE_UUID) return null;

    const edges = this.db.prepare(
      "SELECT * FROM edges WHERE parent_uuid = ? OR child_uuid = ?"
    ).all(nodeUuid, nodeUuid);
    for (const edge of edges) {
      this.#cascadeDeleteEdge(edge);
    }

    this.db.prepare("DELETE FROM memories WHERE node_uuid = ?").run(nodeUuid);
    this.db.prepare("DELETE FROM glossary_keywords WHERE node_uuid = ?").run(nodeUuid);
    this.db.prepare("DELETE FROM nodes WHERE uuid = ?").run(nodeUuid);
    return { deleted: nodeUuid };
  }

  #createEdgeWithPaths(parentUuid, childUuid, name, domain, path, priority = 0, disclosure = null, namespace = "") {
    const { edge, created } = getOrCreateEdge(this.db, parentUuid, childUuid, name, priority, disclosure);
    insertPath(this.db, namespace, domain, path, edge.id, childUuid);
    this.#cascadeCreatePaths(childUuid, domain, path, namespace);
    return { edge, edge_id: edge.id, edge_created: created };
  }

  // ═══════════════════════════════════════════════════════════════════
  // Layer 3: GC
  // ═══════════════════════════════════════════════════════════════════

  #gcEdgeIfPathless(edge) {
    if (countPathsForEdge(this.db, edge.id) > 0) return null;
    this.db.prepare("DELETE FROM edges WHERE id = ?").run(edge.id);
    return { edge_id: edge.id, parent_uuid: edge.parent_uuid, child_uuid: edge.child_uuid };
  }

  #gcNodeSoft(nodeUuid) {
    if (nodeUuid === ROOT_NODE_UUID) return;

    // Count incoming paths across ALL namespaces
    const row = this.db.prepare(
      "SELECT COUNT(*) AS cnt FROM paths WHERE node_uuid = ?"
    ).get(nodeUuid);
    if (row.cnt > 0) return;

    // Delete incoming edges
    const incoming = this.db.prepare("SELECT * FROM edges WHERE child_uuid = ?").all(nodeUuid);
    for (const edge of incoming) this.#gcEdgeIfPathless(edge);

    // Delete outgoing edges
    const outgoing = this.db.prepare("SELECT * FROM edges WHERE parent_uuid = ?").all(nodeUuid);
    for (const edge of outgoing) this.#cascadeDeleteEdge(edge);

    this.#deprecateNodeMemories(nodeUuid);
  }

  #gcNodeIfMemoryless(nodeUuid) {
    if (countMemoriesForNode(this.db, nodeUuid) > 0) return null;
    return this.cascadeDeleteNode(nodeUuid);
  }

  // ═══════════════════════════════════════════════════════════════════
  // Public Write API
  // ═══════════════════════════════════════════════════════════════════

  createMemory(parentPath, content, priority, { title = null, disclosure = null, domain = "core", namespace = "" } = {}) {
    const parentUuid = parentPath === ""
      ? ROOT_NODE_UUID
      : resolveGraphPath(this.db, parentPath, domain, namespace)?.node_uuid;

    if (!parentUuid && parentPath !== "") {
      throw new Error(`Parent '${domain}://${parentPath}' does not exist.`);
    }

    const finalPath = title
      ? (parentPath ? `${parentPath}/${title}` : title)
      : `${parentPath ? parentPath + "/" : ""}${getNextChildNumber(this.db, parentUuid, this.#ns(namespace))}`;

    if (pathExists(this.db, namespace, domain, finalPath)) throw new Error(`Path '${graphUri(domain, finalPath)}' already exists`);

    const newUuid = randomUUID();
    ensureNode(this.db, newUuid);
    const memory = insertMemory(this.db, newUuid, content);
    const edgeName = title ?? leafName(finalPath);

    const created = this.#createEdgeWithPaths(parentUuid, newUuid, edgeName, domain, finalPath, priority, disclosure, namespace);

    if (this.changesetStore) {
      this.changesetStore.record({ memoryId: memory.id, nodeUuid: newUuid, beforeContent: null, afterContent: content });
    }
    if (this.searchIndexer) {
      this.searchIndexer.index(newUuid, content, namespace);
    }

    return {
      id: memory.id, node_uuid: newUuid, domain, path: finalPath,
      uri: graphUri(domain, finalPath), priority,
    };
  }

  updateMemory(path, { content = null, priority = null, disclosure = null, domain = "core", namespace = "" } = {}) {
    if (path === "") throw new Error("Cannot update the root node.");
    if (content === null && priority === null && disclosure === null) {
      throw new Error("At least one of content, priority, or disclosure must be set.");
    }

    const resolved = resolveGraphPath(this.db, path, domain, namespace);
    if (!resolved || !resolved.edge) {
      throw new Error(`Path '${graphUri(domain, path)}' not found`);
    }

    const { edge, node_uuid: nodeUuid } = resolved;
    let oldMemoryId = null;
    let newMemoryId = null;

    // Get current memory
    const currentMem = this.db.prepare(
      "SELECT id FROM memories WHERE node_uuid = ? AND deprecated = 0 ORDER BY created_at DESC LIMIT 1"
    ).get(nodeUuid);
    oldMemoryId = currentMem?.id ?? null;

    // Update edge metadata
    if (priority !== null) {
      this.db.prepare("UPDATE edges SET priority = ? WHERE id = ?").run(priority, edge.id);
    }
    if (disclosure !== null) {
      this.db.prepare("UPDATE edges SET disclosure = ? WHERE id = ?").run(disclosure, edge.id);
    }

    // Content change → new memory version
    if (content !== null) {
      const newMem = insertMemory(this.db, nodeUuid, content, false);
      newMemoryId = newMem.id;
      this.#deprecateNodeMemories(nodeUuid, newMemoryId);
      this.db.prepare(
        "UPDATE memories SET deprecated = 0, migrated_to = NULL WHERE id = ?"
      ).run(newMemoryId);

      // Record changeset + re-index
      if (this.changesetStore) {
        const oldContent = oldMemoryId
          ? this.db.prepare("SELECT content FROM memories WHERE id = ?").get(oldMemoryId)?.content ?? null
          : null;
        this.changesetStore.record({ memoryId: newMemoryId, nodeUuid, beforeContent: oldContent, afterContent: content });
      }
      if (this.searchIndexer) {
        this.searchIndexer.index(nodeUuid, content, namespace);
      }
    }

    return {
      domain, path, uri: graphUri(domain, path),
      old_memory_id: oldMemoryId, new_memory_id: newMemoryId ?? oldMemoryId, node_uuid: nodeUuid,
    };
  }

  rollbackToMemory(targetMemoryId) {
    const target = this.db.prepare("SELECT * FROM memories WHERE id = ?").get(targetMemoryId);
    if (!target) throw new Error(`Memory ID ${targetMemoryId} not found`);

    if (!target.deprecated) {
      return { restored_memory_id: targetMemoryId, was_already_active: true };
    }

    this.#deprecateNodeMemories(target.node_uuid, targetMemoryId);
    this.db.prepare(
      "UPDATE memories SET deprecated = 0, migrated_to = NULL WHERE id = ?"
    ).run(targetMemoryId);

    return { restored_memory_id: targetMemoryId, node_uuid: target.node_uuid };
  }

  addPath(newPath, targetPath, { newDomain = "core", targetDomain = "core", priority = 0, disclosure = null, namespace = "" } = {}) {
    if (newPath === "") throw new Error("Cannot create alias at root path.");

    const target = resolveGraphPath(this.db, targetPath, targetDomain, namespace);
    if (!target) throw new Error(`Target '${graphUri(targetDomain, targetPath)}' not found`);

    const parentUuid = newPath.includes("/")
      ? resolveGraphPath(this.db, newPath.substring(0, newPath.lastIndexOf("/")), newDomain, namespace)?.node_uuid ?? ROOT_NODE_UUID
      : ROOT_NODE_UUID;

    if (pathExists(this.db, namespace, newDomain, newPath)) throw new Error(`Path '${graphUri(newDomain, newPath)}' already exists`);

    if (wouldCreateCycle(this.db, parentUuid, target.node_uuid)) {
      throw new Error(`Cannot create alias: would create a cycle.`);
    }

    const result = this.#createEdgeWithPaths(
      parentUuid, target.node_uuid,
      leafName(newPath), newDomain, newPath,
      priority, disclosure ?? target.edge?.disclosure, namespace,
    );

    return {
      new_uri: graphUri(newDomain, newPath),
      target_uri: graphUri(targetDomain, targetPath),
      node_uuid: target.node_uuid,
      edge_id: result.edge_id, edge_created: result.edge_created,
    };
  }

  removePath(path, domain = "core", namespace = "") {
    if (path === "") throw new Error("Cannot remove root path.");

    const target = resolveGraphPath(this.db, path, domain, namespace);
    if (!target) throw new Error(`Path '${graphUri(domain, path)}' not found`);

    const targetNodeUuid = target.node_uuid;
    const targetEdge = target.edge;

    if (!targetEdge) throw new Error(`Path '${domain}://${path}' has no edge.`);

    // Orphan prevention check
    const childEdges = this.db.prepare(
      "SELECT * FROM edges WHERE parent_uuid = ?"
    ).all(targetNodeUuid);

    const wouldOrphan = [];
    const safe = escapeLikePath(path);

    for (const childEdge of childEdges) {
      // Count surviving paths for child (excluding paths being deleted)
      const survivingStmt = this.db.prepare(`
        SELECT COUNT(*) AS cnt FROM paths
        WHERE node_uuid = ?
        AND NOT (domain = ? AND (path = ? OR path LIKE ? ESCAPE '\\'))
      `);
      const surviving = survivingStmt.get(childEdge.child_uuid, domain, path, `${safe}/%`);
      if (surviving.cnt === 0) {
        // Check if there's a surviving path for the target node
        const targetSurviving = this.db.prepare(`
          SELECT * FROM paths
          WHERE node_uuid = ? AND namespace = ?
          AND NOT (domain = ? AND (path = ? OR path LIKE ? ESCAPE '\\'))
          ORDER BY CASE WHEN domain = ? THEN 0 ELSE 1 END, path
          LIMIT 1
        `).get(targetNodeUuid, namespace, domain, path, `${safe}/%`, domain);
        if (!targetSurviving) {
          wouldOrphan.push(childEdge);
        }
      }
    }

    if (wouldOrphan.length > 0) {
      const details = wouldOrphan.map(e => `'${e.name}' (${e.child_uuid.slice(0, 8)}...)`).join(", ");
      throw new Error(`Cannot remove '${graphUri(domain, path)}': children would become unreachable: ${details}`);
    }

    // Proceed with deletion
    this.#deleteSubtreePaths(domain, path, namespace);

    // GC
    this.#gcEdgeIfPathless(targetEdge);
    this.#gcNodeSoft(targetNodeUuid);

    return { deleted: graphUri(domain, path) };
  }

  restorePath(path, domain, nodeUuid, { parentUuid = null, priority = 0, disclosure = null, namespace = "" } = {}) {
    if (path === "") throw new Error("Cannot restore root path.");

    // Check node exists and has an active memory
    const node = this.db.prepare("SELECT uuid FROM nodes WHERE uuid = ?").get(nodeUuid);
    if (!node) throw new Error(`Node '${nodeUuid}' not found`);

    const activeMem = this.db.prepare(
      "SELECT id FROM memories WHERE node_uuid = ? AND deprecated = 0"
    ).get(nodeUuid);
    if (!activeMem) {
      const latest = this.db.prepare(
        "SELECT id FROM memories WHERE node_uuid = ? ORDER BY created_at DESC LIMIT 1"
      ).get(nodeUuid);
      if (!latest) throw new Error(`Node '${nodeUuid}' has no memory versions`);
      this.db.prepare(
        "UPDATE memories SET deprecated = 0, migrated_to = NULL WHERE id = ?"
      ).run(latest.id);
    }

    if (pathExists(this.db, namespace, domain, path)) throw new Error(`Path '${graphUri(domain, path)}' already exists`);

    if (!parentUuid) {
      if (path.includes("/")) {
        const parentPath = path.substring(0, path.lastIndexOf("/"));
        const parent = resolveGraphPath(this.db, parentPath, domain, namespace);
        parentUuid = parent?.node_uuid ?? ROOT_NODE_UUID;
      } else {
        parentUuid = ROOT_NODE_UUID;
      }
    }

    const edgeName = leafName(path);
    const { edge } = getOrCreateEdge(this.db, parentUuid, nodeUuid, edgeName, priority, disclosure);
    insertPath(this.db, namespace, domain, path, edge.id, nodeUuid);

    return { uri: graphUri(domain, path), node_uuid: nodeUuid };
  }
}

