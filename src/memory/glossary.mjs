export class GlossaryService {
  constructor(db, namespace = "") {
    this.db = db;
    this.namespace = namespace;
    this.fingerprint = null;
    this.automaton = null;
  }

  // ── Aho-Corasick automaton ────────────────────────────────────────

  #ensureAutomaton() {
    const fp = this.#computeFingerprint();
    if (fp === this.fingerprint && this.automaton) return;
    this.fingerprint = fp;
    this.automaton = this.#buildAutomaton();
  }

  #computeFingerprint() {
    const row = this.db.prepare(
      "SELECT COUNT(*) AS cnt, MAX(id) AS max_id FROM glossary_keywords WHERE namespace = ? OR namespace = 'global'"
    ).get(this.namespace);
    return `${row.cnt}:${row.max_id}`;
  }

  #buildAutomaton() {
    const keywords = this.db.prepare(
      "SELECT id, keyword, node_uuid FROM glossary_keywords WHERE namespace = ? OR namespace = 'global'"
    ).all(this.namespace);

    // Build trie
    const go = [new Map()];
    const fail = [0];
    const output = [new Map()];

    for (const kw of keywords) {
      let state = 0;
      for (const ch of kw.keyword) {
        let next = go[state].get(ch);
        if (next === undefined) {
          next = go.length;
          go.push(new Map());
          fail.push(0);
          output.push(new Map());
          go[state].set(ch, next);
        }
        state = next;
      }
      output[state].set(kw.id, kw.node_uuid);
    }

    // Build failure links (BFS)
    const queue = [];
    for (const [ch, next] of go[0]) {
      fail[next] = 0;
      queue.push(next);
    }

    while (queue.length > 0) {
      const r = queue.shift();
      for (const [ch, s] of go[r]) {
        queue.push(s);
        let f = fail[r];
        while (f > 0 && !go[f].has(ch)) f = fail[f];
        fail[s] = go[f].has(ch) ? go[f].get(ch) : 0;
        for (const [kwId, nodeUuid] of output[fail[s]]) {
          output[s].set(kwId, nodeUuid);
        }
      }
    }

    return { go, fail, output };
  }

  // ── Public API ─────────────────────────────────────────────────────

  addKeyword(keyword, nodeUuid, namespace = "") {
    this.db.prepare(
      "INSERT OR IGNORE INTO glossary_keywords (keyword, node_uuid, namespace) VALUES (?, ?, ?)"
    ).run(keyword, nodeUuid, namespace);
    this.fingerprint = null;
  }

  removeKeyword(keywordId) {
    this.db.prepare("DELETE FROM glossary_keywords WHERE id = ?").run(keywordId);
    this.fingerprint = null;
  }

  findInContent(content) {
    if (!content) return [];
    this.#ensureAutomaton();
    if (!this.automaton) return [];

    const { go, fail, output } = this.automaton;
    const matches = [];
    const seen = new Set();
    let state = 0;

    for (let i = 0; i < content.length; i++) {
      const ch = content[i];
      while (state > 0 && !go[state].has(ch)) state = fail[state];
      state = go[state].has(ch) ? go[state].get(ch) : 0;

      for (const [kwId, nodeUuid] of output[state]) {
        if (seen.has(kwId)) continue;
        seen.add(kwId);
        matches.push({ keyword_id: kwId, node_uuid: nodeUuid });
      }
    }

    return matches;
  }

  getAllKeywords() {
    return this.db.prepare(
      "SELECT * FROM glossary_keywords WHERE namespace = ? OR namespace = 'global' ORDER BY keyword"
    ).all(this.namespace);
  }

  getKeywordsForNode(nodeUuid) {
    return this.db.prepare(
      "SELECT * FROM glossary_keywords WHERE node_uuid = ? AND (namespace = ? OR namespace = 'global')"
    ).all(nodeUuid, this.namespace);
  }
}
