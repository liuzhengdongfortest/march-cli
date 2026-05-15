import { strict as assert } from "node:assert";

export async function runContextSkillLayersSmoke() {
  console.log("--- smoke: context skill layers ---");
  const { buildActiveSkills, buildSkillCatalog } = await import("../src/context/skill-layers.mjs");

  const catalog = buildSkillCatalog([
    { name: "review", description: "Review code", filePath: "/path/review/SKILL.md" },
    { name: "plain", description: "No special instructions", filePath: "/path/plain/SKILL.md" },
  ]);
  assert.ok(catalog.includes("[available_skills]"));
  assert.ok(catalog.includes("<name>review</name>"));
  assert.ok(catalog.includes("<description>Review code</description>"));
  assert.ok(catalog.includes("<location>"));
  assert.ok(catalog.includes("activate_skill"));

  const active = buildActiveSkills([
    "quick",
    { name: "deep", body: "Use deep review.", baseDir: "C:/skills/deep" },
  ]);
  assert.ok(active.includes("[active_skills]"));
  assert.ok(active.includes("- quick"));
  assert.ok(active.includes('<skill_content name="deep">'));
  assert.ok(active.includes("Skill directory: C:/skills/deep"));
  assert.ok(active.includes("Use deep review."));
  console.log("  PASS");
}
