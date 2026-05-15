import { homedir } from "node:os";
import { readFileSync, existsSync, statSync } from "node:fs";
import { resolve, basename } from "node:path";
import { loadSkills, loadSkillsFromDir } from "@mariozechner/pi-coding-agent";

/**
 * Convert a Pi Skill to our internal format (augmented with raw content).
 */
function augment(skill) {
  let raw = "";
  let body = "";
  try {
    raw = readFileSync(skill.filePath, "utf-8");
    body = extractBody(raw);
  } catch {}
  return {
    name: skill.name,
    description: skill.description,
    path: skill.filePath,
    baseDir: skill.baseDir,
    raw,
    body,
  };
}

function extractBody(raw) {
  if (!raw.startsWith("---\n") && !raw.startsWith("---\r\n")) return raw;
  const end = raw.indexOf("\n---", 3);
  if (end === -1) return raw;
  return raw.slice(end + 5).replace(/^\n+/, "");
}

/**
 * Scan a directory for skill files using Pi's loader.
 * Convention: .march/skills/<name>/SKILL.md or flat .md files.
 */
export function scanSkillDir(dirPath) {
  if (!existsSync(dirPath)) return [];
  const result = loadSkillsFromDir({ dir: dirPath, source: "project" });
  return result.skills.map(augment);
}

/**
 * Load a single skill from a file path (for --skill flag).
 * Uses Pi's SKILL.md inside a directory, or direct .md file.
 */
export function loadSkillFromFile(filePath) {
  const fullPath = resolve(filePath);
  if (!existsSync(fullPath)) throw new Error(`Skill file not found: ${filePath}`);

  // If it's a directory, look for SKILL.md inside
  let skillFile = fullPath;
  if (statSync(fullPath).isDirectory()) {
    skillFile = resolve(fullPath, "SKILL.md");
    if (!existsSync(skillFile)) throw new Error(`No SKILL.md found in: ${filePath}`);
  }

  const result = loadSkillsFromDir({ dir: resolve(skillFile, ".."), source: "path" });
  const skill = result.skills.find(s => s.filePath === skillFile);
  if (skill) return augment(skill);

  // Fallback: load directly
  const raw = readFileSync(skillFile, "utf-8");
  const body = extractBody(raw);
  const name = basename(resolve(skillFile, ".."));
  return { name, description: "", path: skillFile, baseDir: resolve(skillFile, ".."), raw, body };
}

/**
 * Resolve a skill name to its full content.
 */
export function resolveSkill(skillPool, name) {
  return skillPool.find(s => s.name === name) ?? null;
}

/**
 * Load skills from both project-level and global directories using the SDK's
 * loadSkills() for dedup, collision detection, and validation diagnostics.
 *
 * Convention: ~/.march/skills/ + cwd/.march/skills/
 * Project skills take precedence over global skills with the same name.
 */
export function loadSkillPool(cwd) {
  const globalDir = resolve(homedir(), ".march", "skills");
  const projectDir = resolve(cwd, ".march", "skills");

  // Use SDK's loadSkills with project dir first so project skills win on name collision
  const result = loadSkills({
    cwd,
    agentDir: resolve(homedir(), ".march"),
    skillPaths: [projectDir, globalDir].filter(p => existsSync(p)),
    includeDefaults: false,
  });

  return result.skills.map(augment);
}
