import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import {
  expandTags,
  formatMemoryMarkdown,
  generateMemoryId,
  normalizeTags,
  normalizeText,
  parseMemoryMarkdown,
  quoteFtsTerm,
  walkMarkdownFiles,
} from "./markdown/markdown-format.mjs";
import { scoreEntry, toHint } from "./markdown/markdown-recall.mjs";
import { SemanticMemoryRecallIndex } from "./markdown/semantic-recall.mjs";
import { clearMarkdownMemoryIndex, loadMarkdownMemoryIndex, openMarkdownMemoryIndex, queryMarkdownMemoryIndex, replaceMarkdownMemoryIndex } from "./markdown/sqlite-index.mjs";
import { softDeleteMemoryFile } from "./markdown/markdown-delete.mjs";
import { isMemoryIdLike, isSingleEditAway } from "./markdown/memory-id.mjs";
import { openMarkdownRoot, searchMarkdownRoot } from "./search.mjs";

export { formatRecallHints } from "./markdown/markdown-recall.mjs";
export { normalizeTags } from "./markdown/markdown-format.mjs";

const DEFAULT_SCAN_INTERVAL_MS = 5000;

export class MarkdownMemoryStore {
  constructor({ root, now = () => new Date(), indexPath = null, stateRoot = null, semanticRecall = true, semanticVectorizer = null, semanticModelId = undefined, semanticModelDir = null } = {}) {
    if (!root) throw new Error("MarkdownMemoryStore requires a root path");
    this.root = resolve(root);
    this.now = now;
    this.semanticRecall = semanticRecall ? new SemanticMemoryRecallIndex({ stateRoot, modelId: semanticModelId, modelDir: semanticModelDir, vectorizer: semanticVectorizer }) : null;
    this.semanticRecallWarning = null;
    this.indexPath = indexPath ? resolve(indexPath) : join(this.root, ".march-memory-index.sqlite");
    this.db = openMarkdownMemoryIndex(this.indexPath);
    this.entries = new Map();
    this.pathStats = new Map();
    this.tagDictionary = new Set();
    this.diagnostics = [];
    this.lastScanAt = 0;
    this.scanIntervalMs = DEFAULT_SCAN_INTERVAL_MS;
    this.turnSeenMemoryIds = new Set();
    this.scan();
  }

  scan({ force = false } = {}) {
    mkdirSync(this.root, { recursive: true });
    if (force) clearMarkdownMemoryIndex(this.db);
    const cached = force ? { entries: new Map(), pathStats: new Map() } : loadMarkdownMemoryIndex(this.db);
    const seenPaths = new Set();
    const nextEntries = new Map(cached.entries);
    const nextStats = new Map(cached.pathStats);
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
    this.#rebuildTagDictionary();
    replaceMarkdownMemoryIndex(this.db, this.entries, expandTags);
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
    this.turnSeenMemoryIds = new Set();
  }

  close() {
    this.db.close?.();
  }

  async recallForUser(text, { limit = 3, excludedIds = [] } = {}) {
    const excluded = new Set([...excludedIds, ...this.turnSeenMemoryIds]);
    const hints = await this.#recallSemantic(text, { limit, excluded });
    for (const hint of hints) {
      this.turnSeenMemoryIds.add(hint.id);
    }
    return hints;
  }

  recallForAssistant(text, { limit = 2, currentProject = "", excludedIds = [] } = {}) {
    const excluded = new Set([...excludedIds, ...this.turnSeenMemoryIds]);
    const hints = this.#recallTags(text, { limit, excluded, currentProject });
    for (const hint of hints) this.turnSeenMemoryIds.add(hint.id);
    return hints;
  }

  searchRipgrep(query, { limit = 20, context = 2, syntax = "regex", case: caseMode = "smart", caseMode: explicitCaseMode = null, glob = [] } = {}) {
    this.ensureFresh();
    return searchMarkdownRoot({
      root: this.root,
      paths: this.#activeMemoryPaths(),
      query,
      limit,
      context,
      syntax,
      caseMode: explicitCaseMode ?? caseMode,
      glob,
    });
  }

  open(identifier, options = {}) {
    this.ensureFresh();
    const raw = String(identifier ?? "").trim();
    if (!raw) throw new Error("memory id or path is required");
    const resolved = this.#resolveOpenTarget(raw);
    const opened = openMarkdownRoot({ root: this.root, path: resolved.path, ...options });
    return { ...opened, entry: resolved.entry, requestedId: resolved.requestedId };
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
    const nextPath = existing?.path ?? this.#newMemoryPath(now, nextId);
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

  delete(identifier) {
    this.ensureFresh();
    const raw = String(identifier ?? "").trim();
    if (!raw) throw new Error("memory id or path is required");
    const existing = this.entries.get(raw);
    const path = existing ? existing.path : this.#resolveMemoryPath(raw);
    const result = softDeleteMemoryFile({ path, entry: existing, now: this.now });
    this.scan({ force: true });
    return result;
  }

  async #recallSemantic(text, { limit, excluded }) {
    this.ensureFresh();
    if (!this.semanticRecall?.enabled) return [];
    try {
      const entries = await this.semanticRecall.search(text, { entries: this.entries, excluded, limit });
      return entries.map((entry) => toHint(entry));
    } catch (err) {
      this.semanticRecallWarning = err?.message ?? String(err);
      return [];
    }
  }

  #recallTags(text, { limit, excluded, currentProject }) {
    this.ensureFresh();
    const queryTerms = this.#extractKnownTagTerms(text);
    if (queryTerms.length === 0) return [];
    const query = queryTerms.map(quoteFtsTerm).join(" OR ");
    let rows = [];
    try {
      rows = queryMarkdownMemoryIndex(this.db, query);
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

  #rebuildTagDictionary() {
    this.tagDictionary = new Set();
    for (const entry of this.entries.values()) {
      for (const term of expandTags(entry.tags)) this.tagDictionary.add(normalizeText(term));
    }
  }

  #newMemoryPath(isoDate, id) {
    const date = isoDate.slice(0, 10);
    const [year, month, day] = date.split("-");
    const week = `week${Math.ceil(Number(day) / 7)}`;
    return join(this.root, year, month, week, `${date}-${id}.md`);
  }

  #resolveMemoryPath(raw) {
    const path = isAbsolute(raw) ? raw : resolve(this.root, raw);
    const rel = relative(this.root, path);
    if (rel.startsWith("..") || isAbsolute(rel)) throw new Error(`memory path is outside root: ${raw}`);
    return path;
  }

  #resolveOpenTarget(raw) {
    const exact = this.entries.get(raw);
    if (exact) return { path: exact.path, entry: exact, requestedId: null };
    if (!isMemoryIdLike(raw)) return { path: this.#resolveMemoryPath(raw), entry: null, requestedId: null };

    const candidates = [...this.entries.values()].filter((entry) => isSingleEditAway(raw, entry.id));
    if (candidates.length === 1) return { path: candidates[0].path, entry: candidates[0], requestedId: raw };
    if (candidates.length > 1) {
      throw new Error(`memory id is ambiguous: ${raw}; candidates: ${candidates.map((entry) => entry.id).join(", ")}`);
    }
    throw new Error(`memory not found: ${raw}`);
  }

  #activeMemoryPaths() {
    return [...this.entries.values()]
      .filter((entry) => entry.status === "active")
      .map((entry) => entry.path);
  }
}
