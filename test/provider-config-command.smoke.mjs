import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export async function runProviderConfigCommandSmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: provider config command ---");
  const { runProviderConfigCommand } = await import("../src/provider/config-command.mjs");
  const dir = setupTmp();
  const output = [];
  const code = await runProviderConfigCommand({
    homeDir: dir,
    output: { write: (text) => output.push(text) },
    select: async ({ items }) => items[0].value,
    readSecret: async () => "sk-test",
  });
  assert.equal(code, 0);
  const configPath = join(dir, ".march", "config.json");
  assert.ok(existsSync(configPath));
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  assert.equal(config.providers.deepseek.type, "deepseek");
  assert.equal(config.providers.deepseek.auth.method, "apiKey");
  assert.equal(config.providers.deepseek.auth.apiKey, "sk-test");
  assert.ok(!("provider" in config));
  assert.ok(!("model" in config));
  assert.ok(output.join("").includes("Saved provider: DeepSeek"));
  cleanup(dir);
  console.log("  PASS");
}
