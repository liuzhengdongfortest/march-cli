import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";

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

export function formatRecallHints(source, hints = []) {
  if (!hints.length) return "";
  const lines = [`[passive_recall source="${source}"]`];
  for (const hint of hints) {
    lines.push(`- ${hint.id} | ${hint.name} | ${hint.description}`);
  }
  return lines.join("\n");
}

export function normalizeTags(tags) {
  const raw = Array.isArray(tags) ? tags : [tags];
  const out = [];
  for (const tag of raw) {
    const value = normalizeTag(tag);
    if (value && !out.includes(value)) out.push(value);
  }
  return out;
}

function normalizeTag(tag) {
  return String(tag ?? "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/\/{2,}/g, "/")
    .toLowerCase();
}

function expandTags(tags) {
  const terms = [];
  for (const tag of tags) {
    terms.push(tag);
    for (const part of tag.split(/[\/_-]+/)) {
      if (part) terms.push(part);
    }
  }
  return [...new Set(terms.map(normalizeText).filter(Boolean))];
}

function scoreEntry(entry, terms, currentProject) {
  const expanded = expandTags(entry.tags);
  let score = 0;
  for (const term of terms) {
    if (entry.tags.map(normalizeText).includes(term)) score += 10;
    else if (expanded.includes(term)) score += 5;
  }
  if (currentProject) {
    const projectTag = normalizeText(`project/${currentProject}`);
    if (entry.tags.map(normalizeText).includes(projectTag)) score += 2;
  }
  return score;
}

function toHint(entry) {
  return { id: entry.id, name: entry.name, description: entry.description };
}

function quoteFtsTerm(term) {
  return `"${String(term).replace(/"/g, '""')}"`;
}

function normalizeText(text) {
  return String(text ?? "").trim().toLowerCase();
}

function parseMemoryMarkdown(content) {
  if (!content.startsWith("---\n")) return { frontmatter: {}, body: content, title: extractTitle(content) };
  const end = content.indexOf("\n---", 4);
  if (end === -1) throw new Error("unterminated frontmatter");
  const frontmatter = parseFrontmatter(content.slice(4, end));
  const body = content.slice(content.indexOf("\n", end + 1) + 1);
  return { frontmatter, body, title: extractTitle(body) };
}

function parseFrontmatter(text) {
  const result = {};
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) continue;
    const key = match[1];
    const value = match[2];
    if (value === "") {
      const items = [];
      while (i + 1 < lines.length && /^\s+-\s+/.test(lines[i + 1])) {
        i += 1;
        items.push(unquoteYaml(lines[i].replace(/^\s+-\s+/, "")));
      }
      result[key] = items;
    } else {
      result[key] = unquoteYaml(value);
    }
  }
  return result;
}

function formatMemoryMarkdown({ frontmatter, body }) {
  const lines = ["---"];
  for (const key of ["id", "name", "description", "status", "created_at", "updated_at"]) {
    if (frontmatter[key] != null) lines.push(`${key}: ${formatYamlScalar(frontmatter[key])}`);
  }
  lines.push("tags:");
  for (const tag of frontmatter.tags ?? []) lines.push(`  - ${formatYamlScalar(tag)}`);
  lines.push("---", "", String(body ?? "").trimEnd(), "");
  return lines.join("\n");
}

function unquoteYaml(value) {
  const trimmed = String(value ?? "").trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function formatYamlScalar(value) {
  const text = String(value ?? "");
  if (/[:#\n]|^\s|\s$/.test(text)) return JSON.stringify(text);
  return text;
}

function extractTitle(body) {
  return body.split(/\r?\n/).find((line) => line.startsWith("# "))?.slice(2).trim() ?? "";
}

function generateMemoryId() {
  return `mem_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

function slugify(value) {
  return String(value ?? "memory")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "memory";
}

function walkMarkdownFiles(root) {
  const out = [];
  if (!existsSync(root)) return out;
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) out.push(path);
    }
  };
  walk(root);
  return out;
}
