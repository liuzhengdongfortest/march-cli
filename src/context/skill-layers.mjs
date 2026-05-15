import { formatSkillsForPrompt } from "@mariozechner/pi-coding-agent";

export function buildSkillCatalog(skillPool = []) {
  // Ensure all skills have the fields the SDK expects
  const safePool = skillPool.map(s => ({
    ...s,
    description: s.description ?? "",
    filePath: s.filePath ?? s.path ?? "",
  }));

  const sdkOutput = formatSkillsForPrompt(safePool);
  if (!sdkOutput) return "[available_skills]\n(no skills available)";

  // Replace the SDK's instruction header with our own that references activate_skill
  const xmlIndex = sdkOutput.indexOf("<available_skills>");
  const xmlBlock = xmlIndex !== -1 ? sdkOutput.slice(xmlIndex) : sdkOutput;

  const lines = [
    "The following skills provide specialized instructions for specific tasks.",
    "When a task matches a skill's description, use activate_skill to load its full instructions.",
    "When a skill file references a relative path, resolve it against the skill directory.",
    "",
    xmlBlock,
  ];
  return `[available_skills]\n${lines.join("\n")}`;
}

export function buildActiveSkills(skills = []) {
  const blocks = skills.map((skill) => {
    const name = typeof skill === "string" ? skill : skill.name;
    const body = typeof skill === "string" ? null : (skill.body || skill.raw);
    const baseDir = typeof skill === "string" ? null : skill.baseDir;
    if (body) {
      let header = `<skill_content name="${name}">\n`;
      if (baseDir) {
        header += `Skill directory: ${baseDir}\nRelative paths in this skill are relative to the skill directory.\n`;
      }
      return header + `\n${body}\n</skill_content>`;
    }
    return `- ${name}`;
  });
  return `[active_skills]\n${blocks.join("\n\n")}`;
}
