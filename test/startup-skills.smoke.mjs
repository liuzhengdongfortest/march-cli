import { strict as assert } from "node:assert";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export async function runStartupSkillsSmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: startup skills ---");
  const { activateStartupSkills, createStartupSkillRuntime } = await import("../src/cli/startup-skills.mjs");

  const dir = setupTmp();
  const skillPath = join(dir, "review.md");
  writeFileSync(skillPath, [
    "---",
    "name: review",
    "description: Review code",
    "---",
    "",
    "Review carefully.",
  ].join("\n"), "utf8");
  const projectSkillDir = join(dir, ".march", "skills");
  mkdirSync(projectSkillDir, { recursive: true });
  writeFileSync(join(projectSkillDir, "project.md"), [
    "---",
    "name: project",
    "description: Project skill",
    "---",
    "",
    "Project skill body.",
  ].join("\n"), "utf8");

  const { skillPool, skillState, skillTools } = createStartupSkillRuntime({
    cwd: dir,
    configuredSkills: [skillPath],
    cliSkills: [skillPath],
  });
  assert.ok(skillPool.some(skill => skill.name === "review"));
  assert.equal(skillPool.filter(skill => skill.name === "review").length, 1);
  assert.ok(skillPool.some(skill => skill.name === "project"));
  assert.ok(skillTools.some(tool => tool.name === "activate_skill"));

  const applied = [];
  const engine = { setSkills: (skills) => applied.push(skills.map(skill => skill.name)) };
  const active = activateStartupSkills({
    skillState,
    skillPool,
    skillNames: ["review", "missing", "review"],
    engine,
  });
  assert.deepEqual(active.map(skill => skill.name), ["review"]);
  assert.deepEqual(applied, [["review"]]);

  cleanup(dir);
  console.log("  PASS");
}
