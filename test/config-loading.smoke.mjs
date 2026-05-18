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
  assert.deepEqual(empty.network, { proxy: "system", ca: "system" });
  assert.deepEqual(empty.notifications, { turnEnd: true, desktop: true, bell: false, command: null, minDurationMs: 0, sound: true });

  writeFileSync(join(dir, ".marchrc"), JSON.stringify({ model: "test-model", memoryRoot: "D:/vault/March Memories", skills: ["ignored-legacy-skill"], network: { proxy: "direct" }, notifications: { turnEnd: false, bell: true, minDurationMs: 250 }, webSearch: { provider: "tavily", providers: { tavily: { apiKey: "tvly" } } } }));
  const withRc = loadConfig(dir, { homeDir: dir });
  assert.equal(withRc.model, "test-model");
  assert.equal(withRc.memoryRoot, "D:/vault/March Memories");
  assert.deepEqual(withRc.notifications, { turnEnd: false, desktop: true, bell: true, command: null, minDurationMs: 250, sound: true });
  assert.deepEqual(withRc.network, { proxy: "direct", ca: "system" });
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

  const { loadDotEnv } = await import("../src/config/dotenv.mjs");
  const envDir = setupTmp();
  const homeMarchDir = join(envDir, "home", ".march");
  const sourceDir = join(envDir, "src");
  mkdirSync(homeMarchDir, { recursive: true });
  mkdirSync(sourceDir, { recursive: true });
  writeFileSync(join(envDir, ".env"), "MARCH_SMOKE_DOTENV_PROJECT=project\nMARCH_SMOKE_DOTENV_ORDER=project\nMARCH_SMOKE_DOTENV_SYSTEM=project\n");
  writeFileSync(join(homeMarchDir, ".env"), "MARCH_SMOKE_DOTENV_GLOBAL=global\nMARCH_SMOKE_DOTENV_ORDER=global\n");
  writeFileSync(join(sourceDir, ".env"), "MARCH_SMOKE_DOTENV_SOURCE=source\nMARCH_SMOKE_DOTENV_ORDER=source\n");
  process.env.MARCH_SMOKE_DOTENV_SYSTEM = "system";
  loadDotEnv(envDir, { homeDir: join(envDir, "home"), sourceDir });
  assert.equal(process.env.MARCH_SMOKE_DOTENV_PROJECT, "project");
  assert.equal(process.env.MARCH_SMOKE_DOTENV_GLOBAL, "global");
  assert.equal(process.env.MARCH_SMOKE_DOTENV_SOURCE, "source");
  assert.equal(process.env.MARCH_SMOKE_DOTENV_ORDER, "project");
  assert.equal(process.env.MARCH_SMOKE_DOTENV_SYSTEM, "system");
  for (const key of ["MARCH_SMOKE_DOTENV_PROJECT", "MARCH_SMOKE_DOTENV_GLOBAL", "MARCH_SMOKE_DOTENV_SOURCE", "MARCH_SMOKE_DOTENV_ORDER", "MARCH_SMOKE_DOTENV_SYSTEM"]) delete process.env[key];
  cleanup(envDir);
  cleanup(dir);
  console.log("  PASS");
}
