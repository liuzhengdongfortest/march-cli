import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export async function runWebSearchConfigCommandSmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: websearch config command ---");
  const { runWebSearchConfigCommand } = await import("../src/web/config-command.mjs");
  const { WEB_SEARCH_PRESETS } = await import("../src/web/presets.mjs");
  assert.ok(WEB_SEARCH_PRESETS.some((provider) => provider.id === "tavily"));
  assert.ok(WEB_SEARCH_PRESETS.some((provider) => provider.id === "brave"));

  const dir = setupTmp();
  const output = [];
  const code = await runWebSearchConfigCommand({
    homeDir: dir,
    output: { write: (text) => output.push(text) },
    select: async ({ items }) => items.find((item) => item.value.id === "brave")?.value ?? items[0].value,
    readSecret: async () => "brave-test-key",
  });
  assert.equal(code, 0);
  const configPath = join(dir, ".march", "config.json");
  assert.ok(existsSync(configPath));
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  assert.equal(config.webSearch.provider, "brave");
  assert.equal(config.webSearch.providers.brave.apiKey, "brave-test-key");
  assert.ok(output.join("").includes("Saved web search provider: Brave Search"));
  cleanup(dir);
  console.log("  PASS");
}
