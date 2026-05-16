import { strict as assert } from "node:assert";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export async function runFindToolSmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: March find tool ---");
  const { executeFind } = await import("../src/agent/find-tool.mjs");
  const dir = setupTmp();
  mkdirSync(join(dir, "src", "nested"), { recursive: true });
  mkdirSync(join(dir, "node_modules", "pkg"), { recursive: true });
  writeFileSync(join(dir, "src", "main.mjs"), "main", "utf8");
  writeFileSync(join(dir, "src", "nested", "child.mjs"), "child", "utf8");
  writeFileSync(join(dir, "src", "nested", "child.txt"), "child", "utf8");
  writeFileSync(join(dir, "node_modules", "pkg", "ignored.mjs"), "ignored", "utf8");

  let result = executeFind({ cwd: dir, pattern: "src/**/*.mjs" });
  assert.equal(result.details.error, undefined);
  assert.ok(result.content[0].text.includes("src/main.mjs"));
  assert.ok(result.content[0].text.includes("src/nested/child.mjs"));
  assert.ok(!result.content[0].text.includes("ignored.mjs"));

  result = executeFind({ cwd: dir, pattern: "**/*.mjs", path: "src" });
  assert.ok(result.content[0].text.includes("main.mjs"));
  assert.ok(result.content[0].text.includes("nested/child.mjs"));

  result = executeFind({ cwd: dir, pattern: "*.mjs", path: "src" });
  assert.equal(result.details.effectivePattern, "**/*.mjs");
  assert.ok(result.content[0].text.includes("main.mjs"));
  assert.ok(result.content[0].text.includes("nested/child.mjs"));

  result = executeFind({ cwd: dir, pattern: "**/*.mjs", limit: 1 });
  assert.equal(result.details.resultLimitReached, 1);
  assert.ok(result.content[0].text.includes("Results truncated to 1"));
  assert.ok(!result.content[0].text.includes("Use limit="));

  cleanup(dir);
  console.log("  PASS");
}
