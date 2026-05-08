export class SearchIndexer {
  constructor(db) {
    this.db = db;
    this.#ensureSchema();
  }

  #ensureSchema() {
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS search_fts USING fts5(
        node_uuid,
        namespace,
        content,
        tokenize = 'porter unicode61'
      );
    `);
  }

  /**
   * Index a memory's content for full-text search.
   * Replaces any existing entry for the same (node_uuid, namespace).
   */
  index(nodeUuid, content, namespace = "") {
    this.remove(nodeUuid, namespace);
    this.db.prepare(
      "INSERT INTO search_fts (node_uuid, namespace, content) VALUES (?, ?, ?)",
    ).run(nodeUuid, namespace, content);
  }

  /**
   * Remove a document from the FTS index.
   */
  remove(nodeUuid, namespace = "") {
    this.db.prepare(
      "DELETE FROM search_fts WHERE node_uuid = ? AND namespace = ?",
    ).run(nodeUuid, namespace);
  }

  /**
   * Full-text search with ranking.
   * Returns matching node UUIDs, ranked by relevance.
   */
  search(query, { namespace = "", limit = 20, offset = 0 } = {}) {
    // Sanitize FTS5 query: escape special chars, wrap in quotes for phrase matching
    const sanitized = query.replace(/["*()]/g, "").trim();
    if (!sanitized) return [];

    const ftsQuery = sanitized.split(/\s+/).map(w => `"${w}"`).join(" OR ");

    let sql;
    let params;
    if (namespace) {
      sql = `
        SELECT node_uuid, namespace, content,
               rank AS score,
               snippet(search_fts, 1, '<mark>', '</mark>', '...', 32) AS snippet
        FROM search_fts
        WHERE search_fts MATCH ? AND namespace = ?
        ORDER BY rank
        LIMIT ? OFFSET ?
      `;
      params = [ftsQuery, namespace, limit, offset];
    } else {
      sql = `
        SELECT node_uuid, namespace, content,
               rank AS score,
               snippet(search_fts, 1, '<mark>', '</mark>', '...', 32) AS snippet
        FROM search_fts
        WHERE search_fts MATCH ?
        ORDER BY rank
        LIMIT ? OFFSET ?
      `;
      params = [ftsQuery, limit, offset];
    }

    return this.db.prepare(sql).all(...params);
  }

  /**
   * Quick count of indexed documents.
   */
  count(namespace = "") {
    if (namespace) {
      return this.db.prepare("SELECT COUNT(*) AS cnt FROM search_fts WHERE namespace = ?").get(namespace).cnt;
    }
    return this.db.prepare("SELECT COUNT(*) AS cnt FROM search_fts").get().cnt;
  }

  /**
   * Delete all entries for a namespace.
   */
  clearNamespace(namespace) {
    const result = this.db.prepare("DELETE FROM search_fts WHERE namespace = ?").run(namespace);
    return result.changes;
  }

  /**
   * Rebuild the FTS index from the search_documents table.
   */
  rebuildFromDocuments() {
    this.db.exec("DELETE FROM search_fts");
    const docs = this.db.prepare("SELECT * FROM search_documents").all();
    const insert = this.db.prepare(
      "INSERT INTO search_fts (node_uuid, namespace, content) VALUES (?, ?, ?)",
    );
    for (const doc of docs) {
      insert.run(doc.node_uuid, doc.namespace, doc.content);
    }
    return docs.length;
  }

  /**
   * Suggest completions based on prefix matching.
   */
  suggest(prefix, { namespace = "", limit = 8 } = {}) {
    const sanitized = prefix.replace(/[*"]/g, "").trim();
    if (!sanitized || sanitized.length < 2) return [];

    let sql;
    let params;
    if (namespace) {
      sql = `
        SELECT DISTINCT content
        FROM search_fts
        WHERE search_fts MATCH ? AND namespace = ?
        ORDER BY rank
        LIMIT ?
      `;
      params = [`"${sanitized}"*`, namespace, limit];
    } else {
      sql = `
        SELECT DISTINCT content
        FROM search_fts
        WHERE search_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `;
      params = [`"${sanitized}"*`, limit];
    }

    return this.db.prepare(sql).all(...params).map(r => r.content);
  }
}
