import { defineTool } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import { toolText } from "../agent/tool-result.mjs";

/**
 * Create skill management tools.
 * `state` is a mutable object { active: Skill[] } shared with the engine.
 * `pool` is the full skill pool (from .march/skills/ scan + --skill flags).
 */
export function createSkillTools(state, pool) {
  const listSkills = defineTool({
    name: "list_skills",
    label: "List Skills",
    description: "List all available skills in the pool and which are currently active.",
    parameters: Type.Object({}),
    execute: async () => {
      const poolNames = pool.map(s => s.name);
      const activeNames = state.active.map(s => s.name);
      const lines = [`Available skills (${pool.length}):`];
      for (const name of poolNames) {
        const marker = activeNames.includes(name) ? "[active]" : "[inactive]";
        lines.push(`  ${marker} ${name}`);
      }
      return toolText(lines.join("\n"));
    },
  });

  const activateSkill = defineTool({
    name: "activate_skill",
    label: "Activate Skill",
    description:
      "Activate a skill from the pool. The skill's instructions will be injected into [active_skills] in the context. Use this to load domain-specific knowledge or workflows.",
    parameters: Type.Object({
      name: Type.String({ description: "Name of the skill to activate" }),
    }),
    execute: async (_toolCallId, params) => {
      const skill = pool.find(s => s.name === params.name);
      if (!skill) {
        return toolText(`Skill "${params.name}" not found in pool. Use list_skills to see available skills.`);
      }
      if (state.active.find(s => s.name === params.name)) {
        return toolText(`Skill "${params.name}" is already active.`);
      }
      state.active.push(skill);
      if (state.engine) state.engine.setSkills([...state.active]);
      return toolText(`Activated skill: ${params.name}`);
    },
  });

  const deactivateSkill = defineTool({
    name: "deactivate_skill",
    label: "Deactivate Skill",
    description: "Deactivate a skill. Its instructions will be removed from [active_skills].",
    parameters: Type.Object({
      name: Type.String({ description: "Name of the skill to deactivate" }),
    }),
    execute: async (_toolCallId, params) => {
      const idx = state.active.findIndex(s => s.name === params.name);
      if (idx === -1) {
        return toolText(`Skill "${params.name}" is not active.`);
      }
      state.active.splice(idx, 1);
      if (state.engine) state.engine.setSkills([...state.active]);
      return toolText(`Deactivated skill: ${params.name}`);
    },
  });

  return [listSkills, activateSkill, deactivateSkill];
}
