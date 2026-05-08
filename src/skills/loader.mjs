import { readdirSync, readFileSync, existsSync } from "node:fs";
import { resolve, join, basename } from "node:path";

/**
 * Scan a directory for .md skill files.
 * Each file's first # heading is its skill name; falls back to filename.
 */
export function scanSkillDir(dirPath) {
  if (!existsSync(dirPath)) return [];
  let entries;
  try {
    entries = readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }
  const skills = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const fullPath = resolve(dirPath, entry.name);
    try {
      const raw = readFileSync(fullPath, "utf-8");
      const name = extractSkillName(raw) || basename(entry.name, ".md");
      skills.push({ name, path: fullPath, raw });
    } catch {
      // skip unreadable files
    }
  }
  return skills;
}

/**
 * Load a single skill from a file path (for --skill flag).
 */
export function loadSkillFromFile(filePath) {
  const fullPath = resolve(filePath);
  if (!existsSync(fullPath)) throw new Error(`Skill file not found: ${filePath}`);
  const raw = readFileSync(fullPath, "utf-8");
  const name = extractSkillName(raw) || basename(filePath, ".md");
  return { name, path: fullPath, raw };
}

/**
 * Resolve a skill name to its full content.
 */
export function resolveSkill(skillPool, name) {
  return skillPool.find(s => s.name === name) ?? null;
}

function extractSkillName(raw) {
  const match = raw.match(/^#\s+(.+)/m);
  return match ? match[1].trim() : null;
}
