import { strict as assert } from "node:assert";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SOURCE_ROOT = "src";
const MAX_SOURCE_LINES = 300;

export async function runSourceLineLimitSmoke({ cwd = process.cwd() } = {}) {
  console.log("--- smoke: source line limit ---");
  const oversized = findSourceFiles(cwd)
    .map((path) => ({ path, lines: countLines(path) }))
    .filter((file) => file.lines > MAX_SOURCE_LINES)
    .sort((a, b) => b.lines - a.lines || a.path.localeCompare(b.path));

  if (oversized.length > 0) {
    const details = oversized
      .map((file) => `  - ${relative(cwd, file.path).replaceAll("\\", "/")}: ${file.lines} lines`)
      .join("\n");
    assert.fail([
      `Source files must stay at or below ${MAX_SOURCE_LINES} lines.`,
      "Split oversized files by cohesive responsibility before adding more code.",
      details,
    ].join("\n"));
  }

  console.log("  PASS");
}

function findSourceFiles(cwd) {
  const root = join(cwd, SOURCE_ROOT);
  const files = [];
  walk(root, files);
  return files;
}

function walk(dir, files) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) walk(path, files);
    else if (stat.isFile() && path.endsWith(".mjs")) files.push(path);
  }
}

function countLines(path) {
  return readFileSync(path, "utf8").split("\n").length;
}
