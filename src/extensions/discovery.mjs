import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const EXTENSION_FILE_NAMES = new Set(["index.js", "index.ts", "index.mjs", "index.cjs"]);
const EXTENSION_FILE_EXTENSIONS = new Set([".js", ".ts", ".mjs", ".cjs"]);

export function discoverProjectExtensionPaths(cwd) {
  const extensionsDir = resolve(cwd, ".march", "extensions");
  if (!existsSync(extensionsDir)) return [];

  const entries = readdirSync(extensionsDir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name));
  const paths = [];

  for (const entry of entries) {
    const entryPath = join(extensionsDir, entry.name);
    if (entry.isFile() && hasExtensionFileExtension(entry.name)) {
      paths.push(entryPath);
      continue;
    }
    if (!entry.isDirectory()) continue;

    const indexPath = findExtensionIndex(entryPath);
    if (indexPath) paths.push(indexPath);
  }

  return paths;
}

function findExtensionIndex(dir) {
  for (const fileName of EXTENSION_FILE_NAMES) {
    const filePath = join(dir, fileName);
    if (existsSync(filePath)) return filePath;
  }
  return null;
}

function hasExtensionFileExtension(fileName) {
  return EXTENSION_FILE_EXTENSIONS.has(fileName.slice(fileName.lastIndexOf(".")));
}
