import { randomUUID } from "node:crypto";
import { ROOT_NODE_UUID } from "./database.mjs";
import {
  getChildren,
  getMemoryByPath,
  getRecentMemories,
} from "./graph-read.mjs";
import { getGraphDiagnostics } from "./graph-diagnostics.mjs";

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
    return this.#resolvePath(path, domain, namespace);
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
  // Layer 0: Row-Level Primitives
  // ═══════════════════════════════════════════════════════════════════

  #ensureNode(nodeUuid) {
    const existing = this.db.prepare("SELECT uuid FROM nodes WHERE uuid = ?").get(nodeUuid);
    if (!existing) {
      this.db.prepare("INSERT INTO nodes (uuid) VALUES (?)").run(nodeUuid);
    }
    return nodeUuid;
  }

  #insertMemory(nodeUuid, content, deprecated = false) {
    const result = this.db.prepare(
      "INSERT INTO memories (node_uuid, content, deprecated) VALUES (?, ?, ?)"
    ).run(nodeUuid, content, deprecated ? 1 : 0);
    return { id: Number(result.lastInsertRowid), node_uuid: nodeUuid, content, deprecated: deprecated ? 1 : 0 };
  }

  #getOrCreateEdge(parentUuid, childUuid, name, priority = 0, disclosure = null) {
    const existing = this.db.prepare(
      "SELECT id, parent_uuid, child_uuid, name, priority, disclosure FROM edges WHERE parent_uuid = ? AND child_uuid = ?"
    ).get(parentUuid, childUuid);

    if (existing) return { edge: existing, created: false };

    const result = this.db.prepare(
      "INSERT INTO edges (parent_uuid, child_uuid, name, priority, disclosure) VALUES (?, ?, ?, ?, ?)"
    ).run(parentUuid, childUuid, name, priority, disclosure);
    const edge = {
      id: Number(result.lastInsertRowid), parent_uuid: parentUuid, child_uuid: childUuid,
      name, priority, disclosure,
    };
    return { edge, created: true };
  }

  #insertPath(namespace, domain, path, edgeId, nodeUuid) {
    this.db.prepare(
      "INSERT OR IGNORE INTO paths (namespace, domain, path, edge_id, node_uuid) VALUES (?, ?, ?, ?, ?)"
    ).run(namespace, domain, path, edgeId, nodeUuid);
  }

  #resolvePath(path, domain = "core", namespace = "") {
    if (path === "") {
      return { node_uuid: ROOT_NODE_UUID, edge: null, path_obj: null };
    }
    const row = this.db.prepare(`
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

  #countPathsForEdge(edgeId) {
    const row = this.db.prepare("SELECT COUNT(*) AS cnt FROM paths WHERE edge_id = ?").get(edgeId);
    return row.cnt;
  }

  #countMemoriesForNode(nodeUuid) {
    const row = this.db.prepare("SELECT COUNT(*) AS cnt FROM memories WHERE node_uuid = ?").get(nodeUuid);
    return row.cnt;
  }

  #getNextChildNumber(parentUuid, namespace) {
    const ns = this.#ns(namespace);
    const rows = this.db.prepare(`
      SELECT e.name FROM edges e
      JOIN paths p ON p.edge_id = e.id
      WHERE e.parent_uuid = ? AND p.namespace = ?
    `).all(parentUuid, ns);
    let maxNum = 0;
    for (const row of rows) {
      const num = parseInt(row.name, 10);
      if (!Number.isNaN(num) && num > maxNum) maxNum = num;
    }
    return maxNum + 1;
  }

  #wouldCreateCycle(parentUuid, childUuid) {
    if (parentUuid === ROOT_NODE_UUID) return false;
    if (parentUuid === childUuid) return true;

    const visited = new Set([childUuid]);
    const queue = [childUuid];
    while (queue.length > 0) {
      const current = queue.shift();
      const rows = this.db.prepare("SELECT child_uuid FROM edges WHERE parent_uuid = ?").all(current);
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
        this.#insertPath(namespace, domain, childPath, edge.id, edge.child_uuid);
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
    const safe = path.replace(/[%_]/g, "\\$&");
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
    const { edge, created } = this.#getOrCreateEdge(parentUuid, childUuid, name, priority, disclosure);
    this.#insertPath(namespace, domain, path, edge.id, childUuid);
    this.#cascadeCreatePaths(childUuid, domain, path, namespace);
    return { edge, edge_id: edge.id, edge_created: created };
  }

  // ═══════════════════════════════════════════════════════════════════
  // Layer 3: GC
  // ═══════════════════════════════════════════════════════════════════

  #gcEdgeIfPathless(edge) {
    if (this.#countPathsForEdge(edge.id) > 0) return null;
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
    if (this.#countMemoriesForNode(nodeUuid) > 0) return null;
    return this.cascadeDeleteNode(nodeUuid);
  }

  // ═══════════════════════════════════════════════════════════════════
  // Public Write API
  // ═══════════════════════════════════════════════════════════════════

  createMemory(parentPath, content, priority, { title = null, disclosure = null, domain = "core", namespace = "" } = {}) {
    const parentUuid = parentPath === ""
      ? ROOT_NODE_UUID
      : this.#resolvePath(parentPath, domain, namespace)?.node_uuid;

    if (!parentUuid && parentPath !== "") {
      throw new Error(`Parent '${domain}://${parentPath}' does not exist.`);
    }

    const finalPath = title
      ? (parentPath ? `${parentPath}/${title}` : title)
      : `${parentPath ? parentPath + "/" : ""}${this.#getNextChildNumber(parentUuid, namespace)}`;

    const existing = this.db.prepare(
      "SELECT 1 FROM paths WHERE namespace = ? AND domain = ? AND path = ?"
    ).get(namespace, domain, finalPath);
    if (existing) throw new Error(`Path '${domain}://${finalPath}' already exists`);

    const newUuid = randomUUID();
    this.#ensureNode(newUuid);
    const memory = this.#insertMemory(newUuid, content);
    const edgeName = title ?? finalPath.split("/").pop();

    const created = this.#createEdgeWithPaths(parentUuid, newUuid, edgeName, domain, finalPath, priority, disclosure, namespace);

    if (this.changesetStore) {
      this.changesetStore.record({ memoryId: memory.id, nodeUuid: newUuid, beforeContent: null, afterContent: content });
    }
    if (this.searchIndexer) {
      this.searchIndexer.index(newUuid, content, namespace);
    }

    return {
      id: memory.id, node_uuid: newUuid, domain, path: finalPath,
      uri: `${domain}://${finalPath}`, priority,
    };
  }

  updateMemory(path, { content = null, priority = null, disclosure = null, domain = "core", namespace = "" } = {}) {
    if (path === "") throw new Error("Cannot update the root node.");
    if (content === null && priority === null && disclosure === null) {
      throw new Error("At least one of content, priority, or disclosure must be set.");
    }

    const resolved = this.#resolvePath(path, domain, namespace);
    if (!resolved || !resolved.edge) {
      throw new Error(`Path '${domain}://${path}' not found`);
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
      const newMem = this.#insertMemory(nodeUuid, content, false);
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
      domain, path, uri: `${domain}://${path}`,
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

    const target = this.#resolvePath(targetPath, targetDomain, namespace);
    if (!target) throw new Error(`Target '${targetDomain}://${targetPath}' not found`);

    const parentUuid = newPath.includes("/")
      ? this.#resolvePath(newPath.substring(0, newPath.lastIndexOf("/")), newDomain, namespace)?.node_uuid ?? ROOT_NODE_UUID
      : ROOT_NODE_UUID;

    const existing = this.db.prepare(
      "SELECT 1 FROM paths WHERE namespace = ? AND domain = ? AND path = ?"
    ).get(namespace, newDomain, newPath);
    if (existing) throw new Error(`Path '${newDomain}://${newPath}' already exists`);

    if (this.#wouldCreateCycle(parentUuid, target.node_uuid)) {
      throw new Error(`Cannot create alias: would create a cycle.`);
    }

    const result = this.#createEdgeWithPaths(
      parentUuid, target.node_uuid,
      newPath.split("/").pop(), newDomain, newPath,
      priority, disclosure ?? target.edge?.disclosure, namespace,
    );

    return {
      new_uri: `${newDomain}://${newPath}`,
      target_uri: `${targetDomain}://${targetPath}`,
      node_uuid: target.node_uuid,
      edge_id: result.edge_id, edge_created: result.edge_created,
    };
  }

  removePath(path, domain = "core", namespace = "") {
    if (path === "") throw new Error("Cannot remove root path.");

    const target = this.#resolvePath(path, domain, namespace);
    if (!target) throw new Error(`Path '${domain}://${path}' not found`);

    const targetNodeUuid = target.node_uuid;
    const targetEdge = target.edge;

    if (!targetEdge) throw new Error(`Path '${domain}://${path}' has no edge.`);

    // Orphan prevention check
    const childEdges = this.db.prepare(
      "SELECT * FROM edges WHERE parent_uuid = ?"
    ).all(targetNodeUuid);

    const wouldOrphan = [];
    const safe = path.replace(/[%_]/g, "\\$&");

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
      throw new Error(`Cannot remove '${domain}://${path}': children would become unreachable: ${details}`);
    }

    // Proceed with deletion
    this.#deleteSubtreePaths(domain, path, namespace);

    // GC
    this.#gcEdgeIfPathless(targetEdge);
    this.#gcNodeSoft(targetNodeUuid);

    return { deleted: `${domain}://${path}` };
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

    const existing = this.db.prepare(
      "SELECT 1 FROM paths WHERE namespace = ? AND domain = ? AND path = ?"
    ).get(namespace, domain, path);
    if (existing) throw new Error(`Path '${domain}://${path}' already exists`);

    if (!parentUuid) {
      if (path.includes("/")) {
        const parentPath = path.substring(0, path.lastIndexOf("/"));
        const parent = this.#resolvePath(parentPath, domain, namespace);
        parentUuid = parent?.node_uuid ?? ROOT_NODE_UUID;
      } else {
        parentUuid = ROOT_NODE_UUID;
      }
    }

    const edgeName = path.split("/").pop();
    const { edge } = this.#getOrCreateEdge(parentUuid, nodeUuid, edgeName, priority, disclosure);
    this.#insertPath(namespace, domain, path, edge.id, nodeUuid);

    return { uri: `${domain}://${path}`, node_uuid: nodeUuid };
  }
}

