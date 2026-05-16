import { strict as assert } from "node:assert";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export async function runConfigLoadingSmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: config loading ---");
  const { loadConfig } = await import("../src/config/loader.mjs");
  const dir = setupTmp();

  const empty = loadConfig(dir, { homeDir: dir });
  assert.equal(empty.model, null);
  assert.equal(empty.provider, null);
  assert.deepEqual(empty.providers, {});
  assert.equal(empty.memoryRoot, null);
  assert.deepEqual(empty.webSearch, { provider: null, providers: {} });

  writeFileSync(join(dir, ".marchrc"), JSON.stringify({ model: "test-model", memoryRoot: "D:/vault/March Memories", skills: ["ignored-legacy-skill"], webSearch: { provider: "tavily", providers: { tavily: { apiKey: "tvly" } } } }));
  const withRc = loadConfig(dir, { homeDir: dir });
  assert.equal(withRc.model, "test-model");
  assert.equal(withRc.memoryRoot, "D:/vault/March Memories");
  assert.equal(withRc.webSearch.provider, "tavily");
  assert.equal(withRc.webSearch.providers.tavily.apiKey, "tvly");
  assert.equal(Object.hasOwn(withRc, "skills"), false);

  const marchDir = join(dir, ".march");
  mkdirSync(marchDir, { recursive: true });
  writeFileSync(join(marchDir, "config"), JSON.stringify({ model: "override-model" }));
  writeFileSync(join(marchDir, "config.json"), JSON.stringify({ providers: { deepseek: { type: "deepseek", auth: { method: "apiKey", apiKey: "sk" } } }, webSearch: { provider: "brave", providers: { brave: { apiKey: "brave" } } } }));
  const withBoth = loadConfig(dir, { homeDir: dir });
  assert.equal(withBoth.model, "override-model");
  assert.equal(withBoth.providers.deepseek.type, "deepseek");
  assert.equal(withBoth.webSearch.provider, "brave");
  assert.equal(withBoth.webSearch.providers.tavily.apiKey, "tvly");
  assert.equal(withBoth.webSearch.providers.brave.apiKey, "brave");

  cleanup(dir);
  console.log("  PASS");
}
