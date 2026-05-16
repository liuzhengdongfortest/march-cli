import { readdirSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { toolText } from "./tool-result.mjs";

const DEFAULT_LIMIT = 1000;
const DEFAULT_IGNORES = new Set([".git", "node_modules"]);

export function createFindTool({ cwd }) {
  return defineTool({
    name: "find",
    label: "Find Files",
    description: "Find files by glob pattern. Pattern is matched relative to the search directory. Basename-only patterns like '*.mjs' search recursively, so find('*.mjs', path:'src') and find('src/**/*.mjs') both work.",
    parameters: Type.Object({
      pattern: Type.String({ description: "Glob pattern to match files, e.g. '*.mjs', '**/*.json', or 'src/**/*.test.mjs'" }),
      path: Type.Optional(Type.String({ description: "Directory to search in (default: current directory)" })),
      limit: Type.Optional(Type.Number({ description: "Maximum number of results (default 1000)" })),
    }),
    execute: async (_toolCallId, params) => executeFind({ cwd, ...params }),
  });
}

export function executeFind({ cwd, pattern, path = ".", limit = DEFAULT_LIMIT }) {
  const searchRoot = resolveSearchRoot(cwd, path);
  const trimmedPattern = String(pattern ?? "").trim().replaceAll("\\", "/");
  if (!trimmedPattern) return toolText("Error: pattern is required", { error: true });
  const effectivePattern = normalizePattern(trimmedPattern);

  const max = Math.max(1, Number(limit) || DEFAULT_LIMIT);
  let files;
  try {
    files = listFiles(searchRoot);
  } catch (err) {
    return toolText(`Error: ${err.message}`, { error: true });
  }

  const matches = [];
  for (const file of files) {
    const rel = toPosix(relative(searchRoot, file));
    if (!matchesGlob(effectivePattern, rel)) continue;
    matches.push(rel);
    if (matches.length >= max) break;
  }

  if (matches.length === 0) return toolText("No files found matching pattern", { pattern: trimmedPattern, effectivePattern, path: searchRoot, count: 0 });
  const limitHint = matches.length >= max ? `\n\n[Results truncated to ${max}. Increase limit or refine pattern.]` : "";
  return toolText(`${matches.join("\n")}${limitHint}`, {
    pattern: trimmedPattern,
    effectivePattern: effectivePattern === trimmedPattern ? undefined : effectivePattern,
    path: searchRoot,
    count: matches.length,
    resultLimitReached: matches.length >= max ? max : undefined,
  });
}

function normalizePattern(pattern) {
  if (pattern.includes("/") || pattern.includes("**")) return pattern;
  return `**/${pattern}`;
}

function resolveSearchRoot(cwd, path) {
  const raw = String(path || ".");
  return isAbsolute(raw) ? raw : resolve(cwd, raw);
}

function listFiles(root) {
  const out = [];
  walk(root, out);
  return out.sort((a, b) => toPosix(a).localeCompare(toPosix(b)));
}

function walk(dir, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && DEFAULT_IGNORES.has(entry.name)) continue;
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else if (entry.isFile()) out.push(path);
  }
}

function matchesGlob(pattern, candidate) {
  return matchSegments(splitGlob(pattern), splitGlob(candidate));
}

function matchSegments(patternSegments, candidateSegments) {
  if (patternSegments.length === 0) return candidateSegments.length === 0;
  const [head, ...tail] = patternSegments;
  if (head === "**") {
    if (matchSegments(tail, candidateSegments)) return true;
    return candidateSegments.length > 0 && matchSegments(patternSegments, candidateSegments.slice(1));
  }
  if (candidateSegments.length === 0) return false;
  return matchSegment(head, candidateSegments[0]) && matchSegments(tail, candidateSegments.slice(1));
}

function matchSegment(pattern, candidate) {
  const regex = new RegExp(`^${escapeRegex(pattern).replaceAll("\\*", "[^/]*").replaceAll("\\?", "[^/]")}$`);
  return regex.test(candidate);
}

function splitGlob(value) {
  return String(value).split("/").filter(Boolean);
}

function toPosix(value) {
  return String(value).replaceAll("\\", "/");
}

function escapeRegex(value) {
  return String(value).replace(/[|\\{}()[\]^$+*?.]/g, "\\$&");
}
