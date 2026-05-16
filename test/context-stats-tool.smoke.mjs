import { strict as assert } from "node:assert";
import { join } from "node:path";

export async function runContextStatsToolSmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: context_stats tool ---");
  const { ContextEngine } = await import("../src/context/engine.mjs");
  const { buildContextStats, createContextStatsTool } = await import("../src/agent/context-stats-tool.mjs");
  const dir = setupTmp();

  const engine = new ContextEngine({ cwd: dir, modelId: "test-model", provider: "test", thinkingLevel: "off" });
  engine.setToolDefs([{ name: "context_stats" }]);

  const layers = engine.buildContextLayers("");
  const stats = buildContextStats(engine);
  assert.ok(stats.totalChars > 0);
  assert.equal(stats.runtime.toolDefs, 1);

  const result = await createContextStatsTool({ engine }).execute("tool-call", {});
  const text = result.content[0].text;
  assert.ok(text.includes("Context stats:"));
  assert.ok(!text.includes("[system_core]"));

  cleanup(dir);
  console.log("  PASS");
}
