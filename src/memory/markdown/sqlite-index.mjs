import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS memory_index (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  tags_json TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT,
  updated_at TEXT,
  mtime_ms REAL NOT NULL,
  size INTEGER NOT NULL
);
`;

export function openMarkdownMemoryIndex(path) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA busy_timeout = 5000");
  db.exec("PRAGMA journal_mode = WAL");
  db.exec(SCHEMA);
  return db;
}

export function clearMarkdownMemoryIndex(db) {
  db.exec("DELETE FROM memory_index");
}

export function loadMarkdownMemoryIndex(db) {
  const rows = db.prepare("SELECT * FROM memory_index").all();
  const entries = new Map();
  const pathStats = new Map();
  for (const row of rows) {
    const entry = rowToEntry(row);
    entries.set(entry.id, entry);
    pathStats.set(entry.path, { mtimeMs: entry.mtimeMs, size: entry.size });
  }
  return { entries, pathStats };
}

export function replaceMarkdownMemoryIndex(db, entries) {
  db.exec("BEGIN IMMEDIATE");
  try {
    clearMarkdownMemoryIndex(db);
    const insertMeta = db.prepare(
      "INSERT INTO memory_index (id, path, name, description, tags_json, status, created_at, updated_at, mtime_ms, size) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    );
    for (const entry of entries.values()) {
      insertMeta.run(entry.id, entry.path, entry.name, entry.description, JSON.stringify(entry.tags), entry.status, entry.createdAt, entry.updatedAt, entry.mtimeMs, entry.size);
    }
    db.exec("COMMIT");
  } catch (err) {
    try { db.exec("ROLLBACK"); } catch {}
    throw err;
  }
}

function rowToEntry(row) {
  return {
    id: String(row.id),
    path: String(row.path),
    name: String(row.name),
    description: String(row.description),
    tags: JSON.parse(row.tags_json || "[]"),
    status: String(row.status),
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
    mtimeMs: Number(row.mtime_ms),
    size: Number(row.size),
  };
}
