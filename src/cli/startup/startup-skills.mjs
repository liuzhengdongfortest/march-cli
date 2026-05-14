import { loadSkillPool, loadSkillFromFile } from "../../skills/loader.mjs";
import { createSkillTools } from "../../skills/tools.mjs";

export function createStartupSkillRuntime({ cwd, configuredSkills = [], cliSkills = [] }) {
  const skillPool = loadSkillPool(cwd);
  addSkillFilesToPool(skillPool, configuredSkills);
  addSkillFilesToPool(skillPool, cliSkills);
  const skillState = { active: [], engine: null };
  const skillTools = createSkillTools(skillState, skillPool);
  return { skillPool, skillState, skillTools };
}

export function activateStartupSkills({ skillState, skillPool, skillNames = [], engine = skillState.engine }) {
  for (const name of skillNames) {
    const skill = skillPool.find(s => s.name === name);
    if (skill && !skillState.active.find(active => active.name === name)) {
      skillState.active.push(skill);
    }
  }
  if (skillState.active.length > 0 && engine) {
    engine.setSkills([...skillState.active]);
  }
  return [...skillState.active];
}

function addSkillFilesToPool(skillPool, skillPaths) {
  for (const skillPath of skillPaths) {
    try {
      const skill = loadSkillFromFile(skillPath);
      if (!skillPool.find(s => s.name === skill.name)) {
        skillPool.push(skill);
      }
    } catch {}
  }
}
