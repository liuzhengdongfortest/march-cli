import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import {
  expandTags,
  formatMemoryMarkdown,
  generateMemoryId,
  normalizeTags,
  normalizeText,
  parseMemoryMarkdown,
  quoteFtsTerm,
  slugify,
  walkMarkdownFiles,
} from "./markdown/markdown-format.mjs";
import { formatRecallHints, scoreEntry, toHint } from "./markdown/markdown-recall.mjs";

export { formatRecallHints } from "./markdown/markdown-recall.mjs";
export { normalizeTags } from "./markdown/markdown-format.mjs";

const DEFAULT_SCAN_INTERVAL_MS = 5000;

export class MarkdownMemoryStore {
  constructor({ root, now = () => new Date() } = {}) {
    if (!root) throw new Error("MarkdownMemoryStore requires a root path");
    this.root = resolve(root);
    this.now = now;
    this.db = new DatabaseSync(":memory:");
    this.entries = new Map();
    this.pathStats = new Map();
    this.tagDictionary = new Set();
    this.diagnostics = [];
    this.lastScanAt = 0;
    this.scanIntervalMs = DEFAULT_SCAN_INTERVAL_MS;
    this.userRecallSuppression = new Map();
    this.turnSeenMemoryIds = new Set();
    this.userTurnIndex = 0;
    this.#initDb();
    this.scan({ force: true });
  }

  scan({ force = false } = {}) {
    mkdirSync(this.root, { recursive: true });
    const seenPaths = new Set();
    const nextEntries = force ? new Map() : new Map(this.entries);
    const nextStats = force ? new Map() : new Map(this.pathStats);
    const diagnostics = [];

    for (const path of walkMarkdownFiles(this.root)) {
      seenPaths.add(path);
      const stat = statSync(path);
      const prev = this.pathStats.get(path);
      if (!force && prev && prev.mtimeMs === stat.mtimeMs && prev.size === stat.size) continue;
      try {
        const parsed = parseMemoryMarkdown(readFileSync(path, "utf8"));
        if (!parsed.frontmatter.id) {
          diagnostics.push({ type: "warning", path, message: "Memory file is missing id" });
          continue;
        }
        if (!parsed.frontmatter.description) {
          diagnostics.push({ type: "warning", path, message: "Memory file is missing description; excluded from passive recall" });
        }
        const tags = normalizeTags(parsed.frontmatter.tags ?? []);
        const entry = {
          id: String(parsed.frontmatter.id),
          path,
          name: String(parsed.frontmatter.name ?? parsed.title ?? basename(path, extname(path))),
          description: String(parsed.frontmatter.description ?? ""),
          tags,
          status: String(parsed.frontmatter.status ?? "active"),
          createdAt: parsed.frontmatter.created_at ?? null,
          updatedAt: parsed.frontmatter.updated_at ?? null,
          mtimeMs: stat.mtimeMs,
          size: stat.size,
        };
        const duplicate = [...nextEntries.values()].find((item) => item.id === entry.id && item.path !== path);
        if (duplicate) {
          diagnostics.push({ type: "error", path, message: `Duplicate memory id: ${entry.id} also in ${duplicate.path}` });
          continue;
        }
        for (const [id, item] of nextEntries) {
          if (item.path === path && id !== entry.id) nextEntries.delete(id);
        }
        nextEntries.set(entry.id, entry);
        nextStats.set(path, { mtimeMs: stat.mtimeMs, size: stat.size });
      } catch (err) {
        diagnostics.push({ type: "error", path, message: `Failed to parse memory file: ${err.message}` });
      }
    }

    for (const [id, entry] of nextEntries) {
      if (!seenPaths.has(entry.path)) nextEntries.delete(id);
    }
    for (const path of nextStats.keys()) {
      if (!seenPaths.has(path)) nextStats.delete(path);
    }

    this.entries = nextEntries;
    this.pathStats = nextStats;
    this.diagnostics = diagnostics;
    this.#rebuildIndex();
    this.lastScanAt = Date.now();
    return { entries: this.entries.size, diagnostics };
  }

  ensureFresh() {
    if (Date.now() - this.lastScanAt > this.scanIntervalMs) this.scan();
  }

  beginTurn() {
    this.turnSeenMemoryIds = new Set();
  }

  endTurn() {
    this.userTurnIndex += 1;
    const cutoff = Math.max(0, this.userTurnIndex - 9);
    for (const [id, lastSeenTurn] of this.userRecallSuppression) {
      if (lastSeenTurn < cutoff) this.userRecallSuppression.delete(id);
    }
    this.turnSeenMemoryIds = new Set();
  }

  recallForUser(text, { limit = 3, currentProject = "" } = {}) {
    const excluded = new Set([...this.turnSeenMemoryIds, ...this.userRecallSuppression.keys()]);
    const hints = this.#recall(text, { limit, excluded, currentProject });
    for (const hint of hints) {
      this.turnSeenMemoryIds.add(hint.id);
      this.userRecallSuppression.set(hint.id, this.userTurnIndex);
    }
    return hints;
  }

  recallForAssistant(text, { limit = 2, currentProject = "" } = {}) {
    const hints = this.#recall(text, { limit, excluded: this.turnSeenMemoryIds, currentProject });
    for (const hint of hints) this.turnSeenMemoryIds.add(hint.id);
    return hints;
  }

  searchRipgrep(query, { limit = 20 } = {}) {
    this.ensureFresh();
    const trimmed = String(query ?? "").trim();
    if (!trimmed) return [];
    const max = Math.max(1, Number(limit) || 20);
    const paths = this.#activeMemoryPaths();
    if (paths.length === 0) return [];
    const rg = spawnSync("rg", ["--line-number", "--context", "1", "--color", "never", trimmed, ...paths], {
      encoding: "utf8",
      timeout: 10000,
      windowsHide: true,
    });
    if (rg.error || (rg.status !== 0 && !rg.stdout)) return this.#fallbackSearch(trimmed, max, paths);
    return rg.stdout.split(/\r?\n/).filter(Boolean).slice(0, max).map((line) => ({ line }));
  }

  open(identifier) {
    this.ensureFresh();
    const raw = String(identifier ?? "").trim();
    if (!raw) throw new Error("memory id or path is required");
    const entry = this.entries.get(raw);
    const path = entry ? entry.path : this.#resolveMemoryPath(raw);
    if (!existsSync(path)) throw new Error(`memory not found: ${raw}`);
    return { path, content: readFileSync(path, "utf8"), entry: entry ?? null };
  }

  save({ id = null, name = null, description = null, body = null, tags = null } = {}) {
    this.ensureFresh();
    const existing = id ? this.entries.get(String(id)) : null;
    if (id && !existing) throw new Error(`memory not found: ${id}`);
    const nextId = existing?.id ?? String(id ?? generateMemoryId());
    const now = this.now().toISOString();
    const nextTags = tags == null ? existing?.tags : normalizeTags(tags);
    if (!existing && (!nextTags || nextTags.length === 0)) throw new Error("tags are required when creating a memory");
    if (tags != null && nextTags.length === 0) throw new Error("tags must include at least one valid tag");
    const nextName = name ?? existing?.name;
    const nextDescription = description ?? existing?.description;
    if (!nextName) throw new Error("name is required");
    if (!nextDescription) throw new Error("description is required");
    if (!existing && body == null) throw new Error("body is required");
    const nextBody = body ?? (existing ? parseMemoryMarkdown(readFileSync(existing.path, "utf8")).body : "");
    const nextPath = existing?.path ?? this.#newMemoryPath(now, nextName);
    mkdirSync(dirname(nextPath), { recursive: true });
    const content = formatMemoryMarkdown({
      frontmatter: {
        id: nextId,
        name: nextName,
        description: nextDescription,
        tags: nextTags,
        status: existing?.status ?? "active",
        created_at: existing?.createdAt ?? now,
        updated_at: now,
      },
      body: nextBody,
    });
    writeFileSync(nextPath, content, "utf8");
    this.scan({ force: true });
    return this.entries.get(nextId) ?? { id: nextId, path: nextPath, name: nextName, description: nextDescription, tags: nextTags };
  }

  #recall(text, { limit, excluded, currentProject }) {
    this.ensureFresh();
    const queryTerms = this.#extractKnownTagTerms(text);
    if (queryTerms.length === 0) return [];
    const query = queryTerms.map(quoteFtsTerm).join(" OR ");
    let rows = [];
    try {
      rows = this.db.prepare("SELECT id FROM memory_tags_fts WHERE tags_text MATCH ? LIMIT 50").all(query);
    } catch {
      return [];
    }
    const scored = [];
    for (const row of rows) {
      if (excluded.has(row.id)) continue;
      const entry = this.entries.get(row.id);
      if (!entry || entry.status !== "active" || !entry.description) continue;
      const score = scoreEntry(entry, queryTerms, currentProject);
      if (score <= 0) continue;
      scored.push({ score, entry });
    }
    scored.sort((a, b) => b.score - a.score || a.entry.name.localeCompare(b.entry.name));
    return scored.slice(0, limit).map(({ entry }) => toHint(entry));
  }

  #extractKnownTagTerms(text) {
    const normalized = normalizeText(text);
    if (!normalized) return [];
    const terms = [];
    for (const term of this.tagDictionary) {
      if (term.length < 2) continue;
      if (normalized.includes(term)) terms.push(term);
    }
    return [...new Set(terms)].sort((a, b) => b.length - a.length).slice(0, 16);
  }

  #rebuildIndex() {
    this.db.exec("DELETE FROM memory_index");
    this.db.exec("DELETE FROM memory_tags_fts");
    this.tagDictionary = new Set();
    const insertMeta = this.db.prepare("INSERT INTO memory_index (id, path, name, description, tags_json, status, mtime_ms, size) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
    const insertFts = this.db.prepare("INSERT INTO memory_tags_fts (id, tags_text) VALUES (?, ?)");
    for (const entry of this.entries.values()) {
      insertMeta.run(entry.id, entry.path, entry.name, entry.description, JSON.stringify(entry.tags), entry.status, entry.mtimeMs, entry.size);
      const tagsText = expandTags(entry.tags).join(" ");
      insertFts.run(entry.id, tagsText);
      for (const term of expandTags(entry.tags)) this.tagDictionary.add(normalizeText(term));
    }
  }

  #initDb() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memory_index (
        id TEXT PRIMARY KEY,
        path TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        tags_json TEXT NOT NULL,
        status TEXT NOT NULL,
        mtime_ms REAL NOT NULL,
        size INTEGER NOT NULL
      );
      CREATE VIRTUAL TABLE IF NOT EXISTS memory_tags_fts USING fts5(
        id UNINDEXED,
        tags_text,
        tokenize = 'unicode61'
      );
    `);
  }

  #newMemoryPath(isoDate, name) {
    const date = isoDate.slice(0, 10);
    const [year, month] = date.split("-");
    return join(this.root, year, month, `${date}-${slugify(name)}.md`);
  }

  #resolveMemoryPath(raw) {
    const path = isAbsolute(raw) ? raw : resolve(this.root, raw);
    const rel = relative(this.root, path);
    if (rel.startsWith("..") || isAbsolute(rel)) throw new Error(`memory path is outside root: ${raw}`);
    return path;
  }

  #activeMemoryPaths() {
    return [...this.entries.values()]
      .filter((entry) => entry.status === "active")
      .map((entry) => entry.path);
  }

  #fallbackSearch(query, limit, paths = this.#activeMemoryPaths()) {
    const matches = [];
    for (const path of paths) {
      if (!existsSync(path)) continue;
      const lines = readFileSync(path, "utf8").split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(query)) matches.push({ line: `${path}:${i + 1}:${lines[i]}` });
        if (matches.length >= limit) return matches;
      }
    }
    return matches;
  }
}
