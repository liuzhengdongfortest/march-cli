import { strict as assert } from "node:assert";
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SOURCE_ROOT = "src";
const MAX_DIRECT_SOURCE_FILES = 10;

export async function runSourceDirectoryLimitSmoke({ cwd = process.cwd() } = {}) {
  console.log("--- smoke: source directory file limit ---");
  const oversized = findSourceDirectories(cwd)
    .map((dir) => ({ dir, count: countDirectSourceFiles(dir) }))
    .filter((entry) => entry.count > MAX_DIRECT_SOURCE_FILES)
    .sort((a, b) => b.count - a.count || a.dir.localeCompare(b.dir));

  if (oversized.length > 0) {
    const details = oversized
      .map((entry) => `  - ${relative(cwd, entry.dir).replaceAll("\\", "/")}: ${entry.count} files`)
      .join("\n");
    assert.fail([
      `Source directories must have at most ${MAX_DIRECT_SOURCE_FILES} direct .mjs files.`,
      "Split directories by cohesive responsibility before adding more files.",
      details,
    ].join("\n"));
  }

  console.log("  PASS");
}

function findSourceDirectories(cwd) {
  const root = join(cwd, SOURCE_ROOT);
  const dirs = [];
  walk(root, dirs);
  return dirs;
}

function walk(dir, dirs) {
  dirs.push(dir);
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, dirs);
  }
}

function countDirectSourceFiles(dir) {
  return readdirSync(dir).filter((name) => {
    const path = join(dir, name);
    return statSync(path).isFile() && name.endsWith(".mjs");
  }).length;
}
