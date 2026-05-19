import { execFile } from "node:child_process";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { resolveRipgrepCommand } from "../../../memory/markdown/ripgrep.mjs";

const DEFAULT_LIMIT = 50;
const DEFAULT_CACHE_MS = 2_000;
const SKIP_DIRECTORIES = new Set([".git", "node_modules"]);

export class FileSearchIndex {
  constructor(cwd, options = {}) {
    this.cwd = cwd;
    this.cacheMs = options.cacheMs ?? DEFAULT_CACHE_MS;
    this.now = options.now ?? (() => Date.now());
    this.listFiles = options.listFiles ?? (() => listProjectFiles(cwd));
    this.cache = null;
  }

  async search(query, options = {}) {
    const limit = options.limit ?? DEFAULT_LIMIT;
    const displayDotSlash = options.displayDotSlash ?? false;
    const normalizedQuery = normalizeQuery(query);
    const entries = await this.getEntries();
    const matches = [];

    for (const entry of entries) {
      const score = scorePath(entry.matchPath, normalizedQuery, entry.isDirectory);
      if (score === null) continue;
      matches.push({ entry, score });
    }

    matches.sort((a, b) => a.score - b.score || a.entry.path.localeCompare(b.entry.path));
    return matches.slice(0, limit).map(({ entry }) => toSuggestion(entry, displayDotSlash));
  }

  async getEntries() {
    const now = this.now();
    if (this.cache && now - this.cache.loadedAt < this.cacheMs) return this.cache.entries;

    const files = await this.listFiles();
    const entries = buildEntries(files);
    this.cache = { loadedAt: now, entries };
    return entries;
  }
}

function normalizeQuery(query) {
  return query.replace(/^[.][/\\]/, "").replace(/\\/g, "/").toLowerCase();
}

function buildEntries(files) {
  const seen = new Set();
  const entries = [];

  const add = (path, isDirectory) => {
    const normalizedPath = path.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
    if (!normalizedPath || seen.has(`${isDirectory ? "d" : "f"}:${normalizedPath}`)) return;
    seen.add(`${isDirectory ? "d" : "f"}:${normalizedPath}`);
    const segments = normalizedPath.split("/");
    const name = segments.at(-1);
    entries.push({
      path: normalizedPath,
      isDirectory,
      name,
      matchPath: normalizedPath.toLowerCase(),
    });
  };

  for (const file of files) {
    add(file, false);
    const segments = file.replace(/\\/g, "/").split("/");
    for (let index = 1; index < segments.length; index += 1) {
      add(segments.slice(0, index).join("/"), true);
    }
  }

  return entries;
}

function scorePath(path, query, isDirectory) {
  if (!query) return isDirectory ? 10 : 20;
  const index = path.indexOf(query);
  if (index !== -1) {
    const segmentStart = index === 0 || path[index - 1] === "/";
    return index + (segmentStart ? 0 : 20) + (isDirectory ? 5 : 0);
  }

  const fuzzyScore = scoreSubsequence(path, query);
  if (fuzzyScore === null) return null;
  return 1_000 + fuzzyScore + (isDirectory ? 5 : 0);
}

function scoreSubsequence(path, query) {
  let pathIndex = 0;
  let score = 0;
  let previousMatch = -1;

  for (const char of query) {
    const found = path.indexOf(char, pathIndex);
    if (found === -1) return null;
    score += found - pathIndex;
    if (previousMatch !== -1 && found !== previousMatch + 1) score += 10;
    if (found === 0 || path[found - 1] === "/") score -= 5;
    previousMatch = found;
    pathIndex = found + 1;
  }

  return score + path.length / 100;
}

function toSuggestion(entry, displayDotSlash) {
  const displayPath = `${displayDotSlash ? "./" : ""}${entry.path}${entry.isDirectory ? "/" : ""}`;
  return {
    value: `@${displayPath}`,
    label: `${entry.name}${entry.isDirectory ? "/" : ""}`,
    description: displayPath,
  };
}

async function listProjectFiles(cwd) {
  const ripgrepFiles = await listRipgrepFiles(cwd);
  if (ripgrepFiles) return ripgrepFiles;
  return listFilesRecursively(cwd);
}

function listRipgrepFiles(cwd) {
  return new Promise((resolve) => {
    const command = resolveRipgrepCommand();
    const args = ["--files", "--hidden", "--glob", "!.git/**", "--glob", "!node_modules/**"];
    execFile(command, args, { cwd, maxBuffer: 50 * 1024 * 1024 }, (error, stdout) => {
      if (error) {
        resolve(null);
        return;
      }
      resolve(stdout.split(/\r?\n/).filter(Boolean));
    });
  });
}

async function listFilesRecursively(root, relative = "") {
  const current = relative ? join(root, relative) : root;
  let entries;
  try {
    entries = await readdir(current, { withFileTypes: true });
  } catch {
    return [];
  }

  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory() && SKIP_DIRECTORIES.has(entry.name)) continue;
    const rel = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...await listFilesRecursively(root, rel));
    } else if (entry.isFile()) {
      files.push(rel);
    }
  }
  return files;
}
