import { homedir } from "node:os";
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

/**
 * Load skills from both project-level and global directories.
 * Project skills take precedence over global skills with the same name.
 * Pi-aligned convention: cwd/.march/skills/ + ~/.march/skills/
 */
export function loadSkillPool(cwd) {
  const globalDir = resolve(homedir(), ".march", "skills");
  const projectDir = resolve(cwd, ".march", "skills");

  const pool = new Map();

  // Load global first, so project can override
  for (const skill of scanSkillDir(globalDir)) {
    pool.set(skill.name, skill);
  }
  for (const skill of scanSkillDir(projectDir)) {
    pool.set(skill.name, skill);
  }

  return [...pool.values()];
}
