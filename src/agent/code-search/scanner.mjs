import { execFile } from "node:child_process";
import { lstat, readdir, readFile, stat } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { resolveRipgrepCommand } from "../../memory/markdown/ripgrep.mjs";
import { isSearchableTextPath, languageForPath } from "./languages.mjs";

const DEFAULT_MAX_FILES = 2_000;
const DEFAULT_MAX_FILE_BYTES = 512 * 1024;
const SKIP_DIRS = new Set([".git", "node_modules", "dist", "build", "coverage", ".next", ".turbo", ".cache"]);

export async function scanCodeFiles({ root, path = ".", maxFiles = DEFAULT_MAX_FILES, maxFileBytes = DEFAULT_MAX_FILE_BYTES } = {}) {
  const rootPath = resolve(root);
  const base = resolve(rootPath, path);
  const baseRel = relative(rootPath, base);
  if (baseRel.startsWith("..") || isAbsolute(baseRel)) throw new Error(`Search path escapes workspace: ${path}`);
  let baseInfo;
  try { baseInfo = await stat(base); } catch { return []; }
  const candidates = baseInfo.isFile()
    ? [relative(rootPath, base).replace(/\\/g, "/")]
    : await listCandidateFiles(rootPath, base);
  const files = [];
  for (const relPath of candidates) {
    if (files.length >= maxFiles) break;
    if (!isSearchableTextPath(relPath)) continue;
    const absPath = resolve(root, relPath);
    let info;
    try { info = await stat(absPath); } catch { continue; }
    if (!info.isFile() || info.size > maxFileBytes) continue;
    const content = await readUtf8Text(absPath);
    if (content === null) continue;
    files.push({ absPath, relPath: relPath.replace(/\\/g, "/"), language: languageForPath(relPath), content });
  }
  return files;
}

async function listCandidateFiles(root, base) {
  const fromRipgrep = await listRipgrepFiles(root, base);
  if (fromRipgrep) return fromRipgrep;
  return listFilesRecursively(root, base);
}

function listRipgrepFiles(root, base) {
  return new Promise((resolveResult) => {
    const command = resolveRipgrepCommand();
    const args = ["--files", "--hidden", "--glob", "!.git/**", "--glob", "!node_modules/**"];
    execFile(command, args, { cwd: base, maxBuffer: 50 * 1024 * 1024 }, (error, stdout) => {
      if (error) return resolveResult(null);
      const baseRel = relative(root, base).replace(/\\/g, "/");
      const prefix = baseRel ? `${baseRel}/` : "";
      resolveResult(stdout.split(/\r?\n/).filter(Boolean).map((file) => `${prefix}${file.replace(/\\/g, "/")}`));
    });
  });
}

async function listFilesRecursively(root, dir) {
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return []; }
  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;
    const absPath = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await listFilesRecursively(root, absPath));
    else if (entry.isFile()) files.push(relative(root, absPath).replace(/\\/g, "/"));
  }
  return files;
}

async function readUtf8Text(path) {
  try {
    if ((await lstat(path)).isSymbolicLink()) return null;
    const buffer = await readFile(path);
    if (buffer.includes(0)) return null;
    return buffer.toString("utf8");
  } catch {
    return null;
  }
}
