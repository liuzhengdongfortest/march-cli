import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export function defaultCenterMemoryPath() {
  return join(homedir(), ".march", "memory", "center.md");
}

export function buildCenterMemory(path = defaultCenterMemoryPath()) {
  if (!path || !existsSync(path)) return null;
  const content = readFileSync(path, "utf8").trimEnd();
  if (!content.trim()) return null;
  return `[center_memory]\n--- ${path} ---\n${content}`;
}
