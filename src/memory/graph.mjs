import { randomUUID } from "node:crypto";
import { ROOT_NODE_UUID } from "./database.mjs";
import {
  getChildren,
  getMemoryByPath,
  getRecentMemories,
} from "./graph-read.mjs";
import { getGraphDiagnostics } from "./graph-diagnostics.mjs";
import {
  cascadeCreatePaths,
  cascadeDeleteNode,
  deprecateNodeMemories,
} from "./graph-cascades.mjs";
import { removeGraphPath } from "./graph-path-removal.mjs";
import {
  graphUri,
  leafName,
  pathExists,
} from "./graph-path-utils.mjs";
import {
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

  cascadeDeleteNode(nodeUuid) {
    return cascadeDeleteNode(this.db, nodeUuid);
  }

  #createEdgeWithPaths(parentUuid, childUuid, name, domain, path, priority = 0, disclosure = null, namespace = "") {
    const { edge, created } = getOrCreateEdge(this.db, parentUuid, childUuid, name, priority, disclosure);
    insertPath(this.db, namespace, domain, path, edge.id, childUuid);
    cascadeCreatePaths(this.db, childUuid, domain, path, namespace);
    return { edge, edge_id: edge.id, edge_created: created };
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
      deprecateNodeMemories(this.db, nodeUuid, newMemoryId);
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

    deprecateNodeMemories(this.db, target.node_uuid, targetMemoryId);
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
    return removeGraphPath(this.db, path, domain, namespace);
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

