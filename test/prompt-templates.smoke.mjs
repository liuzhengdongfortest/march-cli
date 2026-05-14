import { strict as assert } from "node:assert";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export async function runPromptTemplatesSmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: prompt templates ---");
  const {
    expandPromptTemplate,
    formatPromptTemplateLines,
    loadPromptTemplates,
    renderPromptTemplate,
  } = await import("../src/cli/input/prompt-templates.mjs");

  const emptyDir = setupTmp();
  assert.deepEqual(loadPromptTemplates(emptyDir), { templates: [], diagnostics: [] });
  cleanup(emptyDir);

  const dir = setupTmp();
  const templatesDir = join(dir, ".march", "templates");
  mkdirSync(templatesDir, { recursive: true });
  writeFileSync(join(templatesDir, "review.md"), "Review {{args}}\nFocus on {{1}}.");
  writeFileSync(join(templatesDir, "bad name.md"), "ignored");

  const loaded = loadPromptTemplates(dir);
  assert.equal(loaded.templates.length, 1);
  assert.equal(loaded.templates[0].name, "review");
  assert.equal(loaded.diagnostics.length, 1);

  assert.equal(renderPromptTemplate("Fix {{1}} using {{args}}", "tests carefully"), "Fix tests using tests carefully");
  assert.deepEqual(expandPromptTemplate("hello", loaded.templates), { type: "none" });
  assert.deepEqual(expandPromptTemplate("/unknown x", loaded.templates), { type: "none" });
  assert.deepEqual(expandPromptTemplate("/review tests now", loaded.templates), {
    type: "template",
    name: "review",
    prompt: "Review tests now\nFocus on tests.",
  });

  const lines = formatPromptTemplateLines(loaded.templates, loaded.diagnostics).join("\n");
  assert.ok(lines.includes("/review"));
  assert.ok(lines.includes("Skipped invalid template name"));
  cleanup(dir);
  console.log("  PASS");
}
