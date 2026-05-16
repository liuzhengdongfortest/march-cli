import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";

export async function runProjectContextSmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: project context ---");

  const { buildProjectContext } = await import("../src/context/project-context.mjs");

  // No AGENTS.md — should return null
  const dir = setupTmp();
  const result = buildProjectContext(dir);
  console.log(`  no files → ${result === null ? "null ✓" : "FAIL"}`);

  // With AGENTS.md in cwd
  const dir2 = setupTmp();
  writeFileSync(join(dir2, "AGENTS.md"), "# Project Rules\n\nAlways use tabs.\n");
  const result2 = buildProjectContext(dir2);
  console.log(`  with AGENTS.md → ${result2?.includes("[project_context]") ? "has header ✓" : "FAIL"}`);
  console.log(`  content → ${result2?.includes("Always use tabs.") ? "has content ✓" : "FAIL"}`);
  console.log(`  file path → ${result2?.includes("AGENTS.md") ? "has path ✓" : "FAIL"}`);

  // Now test full context engine
  const { ContextEngine } = await import("../src/context/engine.mjs");
  const dir3 = setupTmp();
  writeFileSync(join(dir3, "AGENTS.md"), "project-rule: no semicolons");
  const engine = new ContextEngine({
    cwd: dir3,
    modelId: "test",
    provider: "deepseek",
    skills: [],
  });
  const ctx = engine.buildContext("test");
  console.log(`  engine context includes project_context: ${ctx.includes("[project_context]") ? "✓" : "FAIL"}`);
  console.log(`  engine context includes content: ${ctx.includes("project-rule: no semicolons") ? "✓" : "FAIL"}`);

  // buildProviderContext — project_context should be a user message, not system
  const providerCtx = engine.buildProviderContext("test");
  const hasProjectMessage = providerCtx.userMessages.some(
    (msg) => msg.name === "project_context" && msg.content.includes("[project_context]")
  );
  console.log(`  provider userMessages has project_context: ${hasProjectMessage ? "✓" : "FAIL"}`);
  const inSystem = providerCtx.system.includes("[project_context]");
  console.log(`  NOT in system prompt: ${!inSystem ? "✓" : "FAIL"}`);
}
