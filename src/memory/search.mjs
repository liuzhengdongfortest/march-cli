import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { walkMarkdownFiles } from "./markdown/markdown-format.mjs";
import { resolveRipgrepCommand } from "./markdown/ripgrep.mjs";

const DEFAULT_SEARCH_TIMEOUT_MS = 10000;
const DEFAULT_CONTEXT_LINES = 2;
const MAX_CONTEXT_LINES = 20;
const MAX_OPEN_LINES = 400;
const MAX_SEARCH_LIMIT = 50;

export function searchMarkdownRoot({
  root,
  paths = null,
  query,
  limit = 20,
  context = DEFAULT_CONTEXT_LINES,
  syntax = "regex",
  caseMode = "smart",
  glob = [],
} = {}) {
  const resolvedRoot = resolve(root);
  const trimmed = String(query ?? "").trim();
  if (!trimmed) return [];
  const max = clampInt(limit, 1, MAX_SEARCH_LIMIT, 20);
  const contextLines = clampInt(context, 0, MAX_CONTEXT_LINES, DEFAULT_CONTEXT_LINES);
  const searchPaths = (paths ?? walkMarkdownFiles(resolvedRoot)).map((path) => resolve(path));
  if (searchPaths.length === 0) return [];

  const args = ["--json", "--line-number", "--color", "never"];
  if (syntax === "literal") args.push("--fixed-strings");
  if (caseMode === "smart") args.push("--smart-case");
  else if (caseMode === "insensitive") args.push("--ignore-case");
  for (const pattern of normalizeGlob(glob)) args.push("--glob", pattern);
  args.push("--", trimmed, ...searchPaths);

  const rg = spawnSync(resolveRipgrepCommand(), args, {
    encoding: "utf8",
    timeout: DEFAULT_SEARCH_TIMEOUT_MS,
    windowsHide: true,
  });
  if (rg.error || (rg.status !== 0 && !rg.stdout)) {
    return fallbackSearch({ root: resolvedRoot, paths: searchPaths, query: trimmed, limit: max, context: contextLines });
  }

  const matches = [];
  for (const raw of rg.stdout.split(/\r?\n/)) {
    if (!raw) continue;
    let event;
    try {
      event = JSON.parse(raw);
    } catch {
      continue;
    }
    if (event?.type !== "match") continue;
    const data = event.data ?? {};
    const absolutePath = resolve(data.path?.text ?? "");
    if (!isInsideRoot(resolvedRoot, absolutePath)) continue;
    const line = Number(data.line_number) || 1;
    const matchText = data.submatches?.[0]?.match?.text ?? String(data.lines?.text ?? "").replace(/\r?\n$/, "");
    matches.push({
      path: toMemoryPath(resolvedRoot, absolutePath),
      absolutePath,
      line,
      match: matchText,
      excerpt: buildExcerpt({ path: absolutePath, line, context: contextLines }),
      open: { path: toMemoryPath(resolvedRoot, absolutePath), line, context: 40 },
    });
    if (matches.length >= max) break;
  }
  return matches;
}

export function openMarkdownRoot({ root, path, line = null, context = 40, offset = null, limit = null } = {}) {
  const resolvedRoot = resolve(root);
  const absolutePath = resolveMemoryPath(resolvedRoot, path);
  if (!existsSync(absolutePath)) throw new Error(`memory not found: ${path}`);
  const content = readFileSync(absolutePath, "utf8");
  const lines = content.split(/\r?\n/);
  const hasLineRange = line != null || offset != null || limit != null;
  if (!hasLineRange) {
    return {
      path: absolutePath,
      relativePath: toMemoryPath(resolvedRoot, absolutePath),
      content,
      startLine: 1,
      endLine: lines.length,
    };
  }

  let startLine;
  let endLine;
  if (line != null) {
    const center = clampInt(line, 1, lines.length || 1, 1);
    const contextLines = clampInt(context, 0, MAX_OPEN_LINES, 40);
    startLine = Math.max(1, center - contextLines);
    endLine = Math.min(lines.length, center + contextLines);
  } else {
    startLine = clampInt(offset ?? 1, 1, lines.length || 1, 1);
    const maxLines = clampInt(limit ?? 120, 1, MAX_OPEN_LINES, 120);
    endLine = Math.min(lines.length, startLine + maxLines - 1);
  }

  return {
    path: absolutePath,
    relativePath: toMemoryPath(resolvedRoot, absolutePath),
    content: lines.slice(startLine - 1, endLine).join("\n"),
    startLine,
    endLine,
  };
}

export function toMemoryPath(root, path) {
  return relative(resolve(root), resolve(path)).replace(/\\/g, "/");
}

function fallbackSearch({ root, paths, query, limit, context }) {
  const matches = [];
  for (const absolutePath of paths) {
    if (!existsSync(absolutePath)) continue;
    const lines = readFileSync(absolutePath, "utf8").split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].includes(query)) continue;
      const line = i + 1;
      matches.push({
        path: toMemoryPath(root, absolutePath),
        absolutePath,
        line,
        match: query,
        excerpt: buildExcerpt({ path: absolutePath, line, context }),
        open: { path: toMemoryPath(root, absolutePath), line, context: 40 },
      });
      if (matches.length >= limit) return matches;
    }
  }
  return matches;
}

function buildExcerpt({ path, line, context }) {
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  const startLine = Math.max(1, line - context);
  const endLine = Math.min(lines.length, line + context);
  const numbered = [];
  for (let n = startLine; n <= endLine; n++) {
    numbered.push({ line: n, text: lines[n - 1] ?? "" });
  }
  return {
    startLine,
    endLine,
    lines: numbered,
    text: numbered.map((item) => `${item.line} | ${truncateLine(item.text)}`).join("\n"),
  };
}

function resolveMemoryPath(root, rawPath) {
  const raw = String(rawPath ?? "").trim();
  if (!raw) throw new Error("memory path is required");
  const path = isAbsolute(raw) ? resolve(raw) : resolve(root, raw);
  if (!isInsideRoot(root, path)) throw new Error(`memory path is outside root: ${raw}`);
  return path;
}

function isInsideRoot(root, path) {
  const rel = relative(resolve(root), resolve(path));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function normalizeGlob(glob) {
  const items = Array.isArray(glob) ? glob : glob ? [glob] : [];
  return items.map((item) => String(item ?? "").trim()).filter(Boolean).slice(0, 8);
}

function clampInt(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(number)));
}

function truncateLine(text, max = 240) {
  const value = String(text ?? "");
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}
