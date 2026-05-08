import { ROOT_NODE_UUID } from "./database.mjs";

export class SystemViews {
  constructor(db, graph, glossaryService) {
    this.db = db;
    this.graph = graph;
    this.glossarySvc = glossaryService;
  }

  /**
   * system://boot — children of the root node (project boot entries).
   */
  boot() {
    const children = this.graph.getChildren(ROOT_NODE_UUID);
    return children.map(c => ({
      name: c.name,
      node_uuid: c.node_uuid,
      priority: c.priority,
      disclosure: c.disclosure,
      content: c.content_snippet ?? null,
    }));
  }

  /**
   * system://index — all paths with their node UUIDs, grouped by domain.
   */
  index() {
    const rows = this.db.prepare(
      "SELECT domain, path, node_uuid, namespace FROM paths ORDER BY domain, path",
    ).all();
    const domains = {};
    for (const row of rows) {
      const d = row.domain || "core";
      if (!domains[d]) domains[d] = [];
      domains[d].push({ path: row.path, node_uuid: row.node_uuid, namespace: row.namespace });
    }
    return domains;
  }

  /**
   * system://recent — most recently updated memories.
   */
  recent(limit = 20) {
    return this.graph.getRecentMemories(limit);
  }

  /**
   * system://glossary — all glossary keywords with linked nodes.
   */
  glossaryList() {
    return this.glossarySvc.getAllKeywords();
  }

  /**
   * system://diagnostic — health and stats overview.
   */
  diagnostic() {
    const nodeCount = this.db.prepare("SELECT COUNT(*) AS cnt FROM nodes").get().cnt;
    const memoryCount = this.db.prepare("SELECT COUNT(*) AS cnt FROM memories WHERE deprecated = 0").get().cnt;
    const deprecatedCount = this.db.prepare("SELECT COUNT(*) AS cnt FROM memories WHERE deprecated = 1").get().cnt;
    const edgeCount = this.db.prepare("SELECT COUNT(*) AS cnt FROM edges").get().cnt;
    const pathCount = this.db.prepare("SELECT COUNT(*) AS cnt FROM paths").get().cnt;
    const keywordCount = this.db.prepare("SELECT COUNT(*) AS cnt FROM glossary_keywords").get().cnt;
    const ftsCount = this.#ftsCount();
    const changesetCount = this.#changesetCount();

    // Stale nodes: no access in 30 days
    const cutoff = new Date(Date.now() - 30 * 86400000).toISOString();
    const staleNodes = this.db.prepare(
      "SELECT COUNT(*) AS cnt FROM nodes WHERE last_accessed_at IS NOT NULL AND last_accessed_at < ?",
    ).get(cutoff).cnt;

    // Orphan nodes: nodes with no paths pointing to them
    const orphanNodes = this.db.prepare(`
      SELECT COUNT(*) AS cnt FROM nodes n
      WHERE n.uuid != ?
      AND NOT EXISTS (SELECT 1 FROM paths WHERE node_uuid = n.uuid)
      AND NOT EXISTS (SELECT 1 FROM edges WHERE child_uuid = n.uuid)
    `).get(ROOT_NODE_UUID).cnt;

    // Version chain depth stats
    const versionStats = this.db.prepare(`
      SELECT MAX(vc) AS max_depth, AVG(vc) AS avg_depth
      FROM (SELECT COUNT(*) AS vc FROM memories GROUP BY node_uuid)
    `).get();

    return {
      counts: {
        nodes: nodeCount,
        memories: memoryCount,
        deprecated_memories: deprecatedCount,
        edges: edgeCount,
        paths: pathCount,
        keywords: keywordCount,
        fts_documents: ftsCount,
        changesets: changesetCount,
      },
      health: {
        stale_nodes: staleNodes,
        orphan_nodes: orphanNodes,
        max_version_depth: versionStats.max_depth ?? 0,
        avg_version_depth: Math.round((versionStats.avg_depth ?? 0) * 100) / 100,
      },
    };
  }

  #ftsCount() {
    try {
      return this.db.prepare("SELECT COUNT(*) AS cnt FROM search_fts").get().cnt;
    } catch { return 0; }
  }

  #changesetCount() {
    try {
      return this.db.prepare("SELECT COUNT(*) AS cnt FROM changesets").get().cnt;
    } catch { return 0; }
  }
}
