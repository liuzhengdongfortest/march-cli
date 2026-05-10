import { homedir } from "node:os";
import { sep } from "node:path";
import { readdirSync } from "node:fs";

export function buildDirTree({
  cwd,
  maxDepth = 3,
  readdir = readdirSync,
} = {}) {
  const lines = [];
  const walk = (dir, prefix, depth) => {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    const skip = new Set(["node_modules", ".git", "playgroundnocturne_memory"]);
    entries = entries.filter(
      (e) => !e.name.startsWith(".") || e.name === ".march",
    );
    entries = entries.filter((e) => !skip.has(e.name));
    entries = entries.slice(0, 60);
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const isLast = i === entries.length - 1;
      const connector = isLast ? "└── " : "├── ";
      const nextPrefix = prefix + (isLast ? "    " : "│   ");
      if (entry.isDirectory()) {
        lines.push(`${prefix}${connector}${entry.name}/`);
        walk(`${dir}${sep}${entry.name}`, nextPrefix, depth + 1);
      } else {
        lines.push(`${prefix}${connector}${entry.name}`);
      }
    }
  };
  walk(cwd, "", 1);
  return lines.join("\n") || "(empty)";
}

export function buildSessionStatus({
  cwd,
  platform = process.platform,
  home = homedir(),
  maxDepth = 3,
  readdir = readdirSync,
} = {}) {
  const displayPath = cwd.startsWith(home)
    ? `~${cwd.slice(home.length)}`
    : cwd;
  const tree = buildDirTree({ cwd, maxDepth, readdir });
  const shellInfo = platform === "win32"
    ? "shells: powershell (recommended), bash (Git Bash)"
    : "shell: bash";

  return `[session_status]
cwd: ${cwd}
platform: ${platform}
${shellInfo}
project: ${displayPath}

Directory tree (top ${maxDepth} levels):
${tree}`;
}
