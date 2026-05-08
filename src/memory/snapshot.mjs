export class ChangesetStore {
  constructor(db) {
    this.db = db;
    this.#ensureSchema();
  }

  #ensureSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS changesets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        memory_id INTEGER NOT NULL REFERENCES memories(id),
        node_uuid TEXT NOT NULL REFERENCES nodes(uuid),
        before_content TEXT,
        after_content TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_changesets_node ON changesets(node_uuid);
      CREATE INDEX IF NOT EXISTS idx_changesets_memory ON changesets(memory_id);
    `);
  }

  /**
   * Record a before/after snapshot for a memory update.
   * @param {number} memoryId - the NEW memory id
   * @param {string} nodeUuid
   * @param {string|null} beforeContent - previous content (null if creation)
   * @param {string} afterContent - new content
   */
  record({ memoryId, nodeUuid, beforeContent, afterContent }) {
    const result = this.db.prepare(
      "INSERT INTO changesets (memory_id, node_uuid, before_content, after_content) VALUES (?, ?, ?, ?)",
    ).run(memoryId, nodeUuid, beforeContent ?? null, afterContent);
    return { id: Number(result.lastInsertRowid), memory_id: memoryId, node_uuid: nodeUuid };
  }

  /**
   * Get all changesets for a node, most recent first.
   */
  getHistory(nodeUuid, limit = 50) {
    return this.db.prepare(
      "SELECT * FROM changesets WHERE node_uuid = ? ORDER BY id DESC LIMIT ?",
    ).all(nodeUuid, limit);
  }

  /**
   * Get the most recent changesets across all nodes.
   */
  getRecent(limit = 30) {
    return this.db.prepare(
      "SELECT * FROM changesets ORDER BY id DESC LIMIT ?",
    ).all(limit);
  }

  /**
   * Get a specific changeset by id.
   */
  getById(id) {
    return this.db.prepare("SELECT * FROM changesets WHERE id = ?").get(id);
  }

  /**
   * Get the diff summary for a changeset — useful for display.
   */
  diff(changeset) {
    const before = changeset.before_content ?? "";
    const after = changeset.after_content ?? "";
    if (!before) return { type: "create", linesAdded: after.split("\n").length };
    if (!after) return { type: "delete", linesRemoved: before.split("\n").length };

    const beforeLines = before.split("\n");
    const afterLines = after.split("\n");
    const added = afterLines.filter((l) => !before.includes(l)).length;
    const removed = beforeLines.filter((l) => !after.includes(l)).length;
    return { type: "update", linesAdded: Math.max(0, afterLines.length - beforeLines.length), linesRemoved: Math.max(0, beforeLines.length - afterLines.length), changedLines: added + removed };
  }

  /**
   * Delete changesets older than the given number of days.
   */
  pruneOlderThan(days) {
    const result = this.db.prepare(
      "DELETE FROM changesets WHERE created_at < datetime('now', ?)",
    ).run(`-${days} days`);
    return result.changes;
  }
}
