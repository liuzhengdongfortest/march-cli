import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export const ROOT_NODE_UUID = "00000000-0000-0000-0000-000000000000";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS nodes (
  uuid TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_accessed_at TEXT
);

CREATE TABLE IF NOT EXISTS memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  node_uuid TEXT NOT NULL REFERENCES nodes(uuid),
  content TEXT NOT NULL,
  deprecated INTEGER NOT NULL DEFAULT 0,
  migrated_to INTEGER REFERENCES memories(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS edges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_uuid TEXT NOT NULL REFERENCES nodes(uuid),
  child_uuid TEXT NOT NULL REFERENCES nodes(uuid),
  name TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  disclosure TEXT
);

CREATE TABLE IF NOT EXISTS paths (
  namespace TEXT NOT NULL DEFAULT '',
  domain TEXT NOT NULL DEFAULT 'core',
  path TEXT NOT NULL,
  edge_id INTEGER NOT NULL REFERENCES edges(id),
  node_uuid TEXT NOT NULL REFERENCES nodes(uuid),
  PRIMARY KEY (namespace, domain, path)
);

CREATE TABLE IF NOT EXISTS glossary_keywords (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  keyword TEXT NOT NULL,
  node_uuid TEXT NOT NULL REFERENCES nodes(uuid),
  namespace TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS search_documents (
  node_uuid TEXT NOT NULL,
  namespace TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  PRIMARY KEY (node_uuid, namespace)
);

CREATE TABLE IF NOT EXISTS memory_access_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  node_uuid TEXT NOT NULL REFERENCES nodes(uuid),
  namespace TEXT NOT NULL DEFAULT '',
  context TEXT,
  accessed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_memories_node ON memories(node_uuid, deprecated);
CREATE INDEX IF NOT EXISTS idx_memories_migrated ON memories(migrated_to);
CREATE INDEX IF NOT EXISTS idx_edges_parent ON edges(parent_uuid);
CREATE INDEX IF NOT EXISTS idx_edges_child ON edges(child_uuid);
CREATE INDEX IF NOT EXISTS idx_paths_node ON paths(node_uuid);
CREATE INDEX IF NOT EXISTS idx_paths_edge ON paths(edge_id);
CREATE INDEX IF NOT EXISTS idx_glossary_node ON glossary_keywords(node_uuid);
CREATE INDEX IF NOT EXISTS idx_glossary_keyword ON glossary_keywords(keyword);
`;

export function openDatabase(dbPath) {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(SCHEMA);
  ensureRootNode(db);
  return db;
}

function ensureRootNode(db) {
  const row = db.prepare("SELECT uuid FROM nodes WHERE uuid = ?").get(ROOT_NODE_UUID);
  if (!row) {
    db.prepare("INSERT INTO nodes (uuid) VALUES (?)").run(ROOT_NODE_UUID);
    db.prepare("INSERT INTO memories (node_uuid, content, deprecated) VALUES (?, ?, 0)").run(ROOT_NODE_UUID, "Root node");
  }
}

// ── Node operations ────────────────────────────────────────────────────

export function createNode(db, uuid) {
  db.prepare("INSERT OR IGNORE INTO nodes (uuid) VALUES (?)").run(uuid);
  return { uuid };
}

export function getNode(db, uuid) {
  return db.prepare("SELECT * FROM nodes WHERE uuid = ?").get(uuid);
}

function touchNode(db, uuid) {
  db.prepare("UPDATE nodes SET last_accessed_at = datetime('now') WHERE uuid = ?").run(uuid);
}

// ── Memory operations ───────────────────────────────────────────────────

export function createMemory(db, nodeUuid, content) {
  const result = db.prepare("INSERT INTO memories (node_uuid, content) VALUES (?, ?)").run(nodeUuid, content);
  touchNode(db, nodeUuid);
  return { id: Number(result.lastInsertRowid), node_uuid: nodeUuid, content };
}

export function getCurrentMemory(db, nodeUuid) {
  return db.prepare("SELECT * FROM memories WHERE node_uuid = ? AND deprecated = 0 ORDER BY id DESC LIMIT 1").get(nodeUuid);
}

export function getMemoryHistory(db, nodeUuid) {
  return db.prepare("SELECT * FROM memories WHERE node_uuid = ? ORDER BY id DESC").all(nodeUuid);
}

export function updateMemory(db, nodeUuid, newContent) {
  const current = getCurrentMemory(db, nodeUuid);
  if (!current) return null;
  db.prepare("UPDATE memories SET deprecated = 1 WHERE id = ?").run(current.id);
  const result = db.prepare("INSERT INTO memories (node_uuid, content) VALUES (?, ?)").run(nodeUuid, newContent);
  db.prepare("UPDATE memories SET migrated_to = ? WHERE id = ?").run(Number(result.lastInsertRowid), current.id);
  touchNode(db, nodeUuid);
  return { id: Number(result.lastInsertRowid), node_uuid: nodeUuid, content: newContent, previous_id: current.id };
}

export function deleteMemory(db, nodeUuid) {
  const pathRows = db.prepare("SELECT edge_id FROM paths WHERE node_uuid = ?").all(nodeUuid);
  db.prepare("DELETE FROM paths WHERE node_uuid = ?").run(nodeUuid);
  for (const row of pathRows) {
    try { db.prepare("DELETE FROM edges WHERE id = ?").run(row.edge_id); } catch {}
  }
  db.prepare("DELETE FROM edges WHERE parent_uuid = ? OR child_uuid = ?").run(nodeUuid, nodeUuid);
  db.prepare("DELETE FROM glossary_keywords WHERE node_uuid = ?").run(nodeUuid);
  db.prepare("DELETE FROM search_documents WHERE node_uuid = ?").run(nodeUuid);
  db.prepare("DELETE FROM memory_access_log WHERE node_uuid = ?").run(nodeUuid);
  db.prepare("DELETE FROM memories WHERE node_uuid = ?").run(nodeUuid);
  const result = db.prepare("DELETE FROM nodes WHERE uuid = ? AND uuid != ?").run(nodeUuid, ROOT_NODE_UUID);
  return result.changes > 0;
}

// ── Edge operations ─────────────────────────────────────────────────────

export function createEdge(db, parentUuid, childUuid, { name = "related", priority = 0, disclosure = null } = {}) {
  const result = db.prepare(
    "INSERT INTO edges (parent_uuid, child_uuid, name, priority, disclosure) VALUES (?, ?, ?, ?, ?)",
  ).run(parentUuid, childUuid, name, priority, disclosure);
  return { id: Number(result.lastInsertRowid), parent_uuid: parentUuid, child_uuid: childUuid, name };
}

export function getEdges(db, nodeUuid, { direction = "both" } = {}) {
  if (direction === "children") return db.prepare("SELECT * FROM edges WHERE parent_uuid = ? ORDER BY priority DESC").all(nodeUuid);
  if (direction === "parents") return db.prepare("SELECT * FROM edges WHERE child_uuid = ? ORDER BY priority DESC").all(nodeUuid);
  return db.prepare("SELECT * FROM edges WHERE parent_uuid = ? OR child_uuid = ? ORDER BY priority DESC").all(nodeUuid, nodeUuid);
}

export function deleteEdge(db, edgeId) {
  db.prepare("DELETE FROM paths WHERE edge_id = ?").run(edgeId);
  return db.prepare("DELETE FROM edges WHERE id = ?").run(edgeId).changes > 0;
}

// ── Path operations ─────────────────────────────────────────────────────

export function createPath(db, { namespace = "", domain = "core", path, edgeId, nodeUuid }) {
  db.prepare("INSERT OR REPLACE INTO paths (namespace, domain, path, edge_id, node_uuid) VALUES (?, ?, ?, ?, ?)").run(namespace, domain, path, edgeId, nodeUuid);
  return { namespace, domain, path, edge_id: edgeId, node_uuid: nodeUuid };
}

export function getPath(db, namespace, domain, path) {
  return db.prepare("SELECT * FROM paths WHERE namespace = ? AND domain = ? AND path = ?").get(namespace, domain, path);
}

export function getPathsForNode(db, nodeUuid) {
  return db.prepare("SELECT * FROM paths WHERE node_uuid = ?").all(nodeUuid);
}

export function listPaths(db, namespace = "", domain = "core", parentPath = "") {
  const prefix = parentPath ? `${parentPath}/` : "";
  return db.prepare("SELECT * FROM paths WHERE namespace = ? AND domain = ? AND path LIKE ? ORDER BY path").all(namespace, domain, `${prefix}%`);
}

// ── Glossary operations ─────────────────────────────────────────────────

export function addGlossaryKeyword(db, keyword, nodeUuid, namespace = "") {
  db.prepare("INSERT OR IGNORE INTO glossary_keywords (keyword, node_uuid, namespace) VALUES (?, ?, ?)").run(keyword, nodeUuid, namespace);
}

export function findNodeByKeyword(db, keyword, namespace = "") {
  return db.prepare("SELECT * FROM glossary_keywords WHERE keyword = ? AND (namespace = ? OR namespace = '')").get(keyword, namespace);
}

export function getGlossaryKeywords(db, namespace = "") {
  return db.prepare("SELECT * FROM glossary_keywords WHERE namespace = ? OR namespace = '' ORDER BY keyword").all(namespace);
}

// ── Search operations ───────────────────────────────────────────────────

export function indexSearchDocument(db, nodeUuid, content, namespace = "") {
  db.prepare("INSERT OR REPLACE INTO search_documents (node_uuid, namespace, content) VALUES (?, ?, ?)").run(nodeUuid, namespace, content);
}

export function searchByContent(db, query, namespace = "") {
  return db.prepare("SELECT * FROM search_documents WHERE (namespace = ? OR namespace = '') AND content LIKE ?").all(namespace, `%${query}%`);
}

// ── Access log ──────────────────────────────────────────────────────────

export function logAccess(db, nodeUuid, context = null, namespace = "") {
  db.prepare("INSERT INTO memory_access_log (node_uuid, namespace, context) VALUES (?, ?, ?)").run(nodeUuid, namespace, context);
}

export function getRecentAccesses(db, limit = 20) {
  return db.prepare("SELECT * FROM memory_access_log ORDER BY accessed_at DESC LIMIT ?").all(limit);
}
