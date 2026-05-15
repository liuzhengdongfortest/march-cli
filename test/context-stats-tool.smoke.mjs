import { strict as assert } from "node:assert";
import { join } from "node:path";
import { writeFileSync } from "node:fs";

export async function runContextStatsToolSmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: context_stats tool ---");
  const { ContextEngine } = await import("../src/context/engine.mjs");
  const { buildContextStats, createContextStatsTool } = await import("../src/agent/context-stats-tool.mjs");
  const dir = setupTmp();
  const file = join(dir, "open.txt");
  writeFileSync(file, "alpha\nbeta\ngamma", "utf8");

  const engine = new ContextEngine({ cwd: dir, modelId: "test-model", provider: "test", thinkingLevel: "off" });
  engine.openFile(file);
  engine.setToolDefs([{ name: "context_stats" }, { name: "open_file" }]);

  const layers = engine.buildContextLayers("");
  assert.ok(layers.some((layer) => layer.name === "open_files"));
  assert.equal(engine.buildContext(""), layers.map((layer) => layer.text).join("\n\n"));

  const stats = buildContextStats(engine);
  assert.ok(stats.totalChars > 0);
  assert.ok(stats.layers.some((layer) => layer.name === "open_files" && layer.chars > 0));
  assert.equal(stats.openFiles.count, 1);
  assert.equal(stats.openFiles.largest[0].path, "open.txt");
  assert.equal(stats.runtime.toolDefs, 2);

  const result = await createContextStatsTool({ engine }).execute("tool-call", {});
  const text = result.content[0].text;
  assert.ok(text.includes("Context stats:"));
  assert.ok(text.includes("- open_files:"));
  assert.ok(text.includes("Largest open files:"));
  assert.ok(!text.includes("[system_core]"));

  cleanup(dir);
  console.log("  PASS");
}
