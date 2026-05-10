import { strict as assert } from "node:assert";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export async function runAuthStorageSmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: auth storage ---");
  const {
    createMarchAuthStorage,
    getMarchAuthPath,
    loadDotEnvFile,
    providerApiKeyEnv,
  } = await import("../src/auth/storage.mjs");

  assert.equal(providerApiKeyEnv("deepseek"), "DEEPSEEK_API_KEY");
  assert.equal(providerApiKeyEnv("openai"), "OPENAI_API_KEY");
  assert.equal(providerApiKeyEnv("openai-codex"), "OPENAI_CODEX_API_KEY");
  assert.equal(providerApiKeyEnv("custom"), "CUSTOM_API_KEY");
  assert.equal(getMarchAuthPath("C:/Users/test").replaceAll("\\", "/"), "C:/Users/test/.march/auth.json");

  const env = {};
  const dir = setupTmp();
  writeFileSync(join(dir, ".env"), [
    "deepseek_api_key=project-key",
    "OPENAI_API_KEY=openai-key",
    "EMPTY",
    "# comment",
  ].join("\n"));
  const diagnostic = loadDotEnvFile(join(dir, ".env"), { env });
  assert.equal(diagnostic.type, "info");
  assert.equal(env.DEEPSEEK_API_KEY, "project-key");
  assert.equal(env.OPENAI_API_KEY, "openai-key");

  const calls = [];
  const authStorage = {
    setRuntimeApiKey: (provider, key) => calls.push([provider, key]),
    hasAuth: () => false,
  };
  const resolved = createMarchAuthStorage({
    provider: "deepseek",
    cwd: dir,
    homeDir: dir,
    env,
    authStorage,
    loadEnv: false,
  });
  assert.equal(resolved.hasApiKey, true);
  assert.equal(resolved.hasAuth, true);
  assert.equal(resolved.authStorage, authStorage);
  assert.equal(resolved.authPath, getMarchAuthPath(dir));
  assert.equal(resolved.apiKeyEnv, "DEEPSEEK_API_KEY");
  assert.deepEqual(calls, [["deepseek", "project-key"]]);

  const missing = createMarchAuthStorage({
    provider: "anthropic",
    cwd: dir,
    homeDir: dir,
    env,
    authStorage,
    loadEnv: false,
  });
  assert.equal(missing.hasApiKey, false);
  assert.equal(missing.hasAuth, false);
  assert.equal(missing.apiKeyEnv, "ANTHROPIC_API_KEY");

  const stored = createMarchAuthStorage({
    provider: "openai-codex",
    cwd: dir,
    homeDir: dir,
    env: {},
    authStorage: {
      setRuntimeApiKey: () => {},
      hasAuth: (provider) => provider === "openai-codex",
    },
    loadEnv: false,
  });
  assert.equal(stored.hasApiKey, false);
  assert.equal(stored.hasAuth, true);
  cleanup(dir);

  const envDir = setupTmp();
  const homeDir = setupTmp();
  mkdirSync(join(homeDir, ".march"), { recursive: true });
  writeFileSync(join(homeDir, ".march", ".env"), "CUSTOM_API_KEY=home-key\n");
  const homeEnv = {};
  const homeCalls = [];
  const homeResolved = createMarchAuthStorage({
    provider: "custom",
    cwd: envDir,
    homeDir,
    env: homeEnv,
    authStorage: { setRuntimeApiKey: (provider, key) => homeCalls.push([provider, key]) },
  });
  assert.equal(homeResolved.hasApiKey, true);
  assert.deepEqual(homeCalls, [["custom", "home-key"]]);
  cleanup(envDir);
  cleanup(homeDir);
  console.log("  PASS");
}
