export function buildSkillCatalog(skillPool = []) {
  const lines = [
    "The following skills provide specialized instructions for specific tasks.",
    "When a task matches a skill's description, use activate_skill to load its full instructions.",
    "",
    "<available_skills>",
  ];
  for (const skill of skillPool) {
    lines.push("  <skill>");
    lines.push(`    <name>${skill.name}</name>`);
    lines.push(`    <description>${skill.description || "(no description)"}</description>`);
    lines.push("  </skill>");
  }
  lines.push("</available_skills>");
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
