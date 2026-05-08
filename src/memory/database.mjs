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
    db.prepare(
      "INSERT INTO memories (node_uuid, content, deprecated) VALUES (?, ?, 0)"
    ).run(ROOT_NODE_UUID, "Root node");
  }
}
