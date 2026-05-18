import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { toolText } from "../tool-result.mjs";

const DEFAULT_LIMIT = 30;
const DEFAULT_DIRECTORY_LIMIT = 200;
const MAX_LIMIT = 2000;

export function createReadFileTool({ engine }) {
  return defineTool({
    name: "read",
    label: "Read File",
    description: "Read a file slice with 1-based line numbers. Use offset and limit to read specific line ranges.",
    parameters: Type.Object({
      path: Type.String({ description: "Absolute or relative path to read" }),
      offset: Type.Optional(Type.Number({ description: "1-based line number to start reading from; default 1" })),
      limit: Type.Optional(Type.Number({ description: "Maximum number of lines to read; default 30, max 2000" })),
    }),
    execute: async (_toolCallId, params) => readFileSlice({ engine, ...params }),
  });
}

export function readFileSlice({ engine, path, offset = 1, limit = DEFAULT_LIMIT }) {
  const absPath = engine.resolvePath(path);
  let stat;
  try {
    stat = statSync(absPath);
  } catch (err) {
    return toolText(`Error reading ${absPath}: ${err.message}`, { error: true, path: absPath });
  }
  if (stat.isDirectory()) return readDirectoryListing({ path: absPath, offset, limit });

  let content;
  try {
    content = readFileSync(absPath, "utf8");
  } catch (err) {
    if (err?.code === "EISDIR") {
      return toolText(`Error reading ${absPath}: this is a directory. Use ls(path) or find(pattern, path) to inspect it.`, { error: true, path: absPath, isDirectory: true });
    }
    return toolText(`Error reading ${absPath}: ${err.message}`, { error: true, path: absPath });
  }

  const lines = content.split("\n");
  const start = clampLine(offset, lines.length);
  const count = clampLimit(limit);
  const selected = lines.slice(start - 1, start - 1 + count);
  const end = start + selected.length - 1;
  const body = selected.map((line, index) => `${start + index}| ${line}`).join("\n");
  const header = `--- ${absPath} (lines ${start}-${end} of ${lines.length}) ---`;
  const remaining = lines.length - end;
  const footer = remaining > 0 ? `\n\n[${remaining} more lines in file. Use offset=${end + 1} to continue.]` : "";
  return toolText(`${header}\n${body || "(empty)"}${footer}`, {
    path: absPath,
    offset: start,
    limit: count,
    totalLines: lines.length,
    endLine: end,
    truncated: remaining > 0,
  });
}

function readDirectoryListing({ path, offset = 1, limit }) {
  let entries;
  try {
    entries = readdirSync(path, { withFileTypes: true })
      .map((entry) => ({
        name: entry.name,
        label: entry.isDirectory() ? `${entry.name}/` : entry.name,
        isDirectory: entry.isDirectory(),
      }))
      .sort((a, b) => Number(b.isDirectory) - Number(a.isDirectory) || a.name.localeCompare(b.name));
  } catch (err) {
    return toolText(`Error reading ${path}: ${err.message}`, { error: true, path });
  }

  const start = entries.length === 0 ? 0 : clampLine(offset, entries.length);
  const count = clampLimit(limit ?? DEFAULT_DIRECTORY_LIMIT);
  const selected = start === 0 ? [] : entries.slice(start - 1, start - 1 + count);
  const end = start + selected.length - 1;
  const remaining = start === 0 ? 0 : entries.length - end;
  const range = entries.length === 0 ? "0 entries" : `entries ${start}-${end} of ${entries.length}`;
  const header = `--- ${path} (directory, ${range}) ---`;
  const footer = remaining > 0 ? `\n\n[${remaining} more entries in directory. Use offset=${end + 1} to continue, or find(pattern, path) to search recursively.]` : "";
  return toolText(`${header}\n${selected.map((entry) => entry.label).join("\n") || "(empty directory)"}${footer}`, {
    path,
    isDirectory: true,
    entryCount: entries.length,
    offset: start,
    limit: count,
    endEntry: end,
    truncated: remaining > 0,
    entries: selected.map((entry) => ({
      name: entry.name,
      path: resolve(path, entry.name),
      isDirectory: entry.isDirectory,
    })),
  });
}

function clampLine(value, lineCount) {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.min(parsed, Math.max(1, lineCount));
}

function clampLimit(value) {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_LIMIT;
  return Math.min(parsed, MAX_LIMIT);
}
