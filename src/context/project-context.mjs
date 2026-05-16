import { loadProjectContextFiles } from "@earendil-works/pi-coding-agent";
import { homedir } from "node:os";
import { resolve } from "node:path";

/**
 * Build the [project_context] layer from AGENTS.md / CLAUDE.md files.
 * Uses SDK's loadProjectContextFiles to scan:
 *   - ~/.march/ (global)
 *   - cwd upward to root (ancestor directories, closest first)
 *
 * Returns null if no files found.
 */
export function buildProjectContext(cwd) {
  const agentDir = resolve(homedir(), ".march");
  const files = loadProjectContextFiles({ cwd, agentDir });
  if (!files || files.length === 0) return null;

  const blocks = files.map((f) => `--- ${f.path} ---\n${f.content.trimEnd()}`);
  return `[project_context]\n${blocks.join("\n\n")}`;
}
