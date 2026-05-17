import { strict as assert } from "node:assert";

export async function runAuthStorageSmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: auth storage ---");
  const {
    createMarchAuthStorage,
    getMarchAuthPath,
  } = await import("../src/auth/storage.mjs");

  assert.equal(getMarchAuthPath("C:/Users/test").replaceAll("\\", "/"), "C:/Users/test/.march/auth.json");

  const dir = setupTmp();
  const authStorage = {
    setRuntimeApiKey: () => {},
    list: () => [],
  };
  const resolved = createMarchAuthStorage({
    homeDir: dir,
    authStorage,
  });
  assert.equal(resolved.hasAuth, false);
  assert.equal(resolved.authStorage, authStorage);
  assert.equal(resolved.authPath, getMarchAuthPath(dir));
  assert.deepEqual(resolved.diagnostics, []);

  const providerCalls = [];
  const multi = createMarchAuthStorage({
    providers: {
      openai: { type: "openai", auth: { method: "apiKey", apiKey: "openai-config-key" } },
      anthropic: { type: "anthropic", auth: { method: "apiKey", apiKey: "anthropic-config-key" } },
      local: { type: "openai-compatible", auth: { method: "apiKey", apiKey: "local-config-key" } },
    },
    homeDir: dir,
    authStorage: { setRuntimeApiKey: (provider, key) => providerCalls.push([provider, key]), list: () => [] },
  });
  assert.equal(multi.hasAuth, true);
  assert.deepEqual(providerCalls, [["openai", "openai-config-key"], ["anthropic", "anthropic-config-key"], ["local", "local-config-key"]]);

  const stored = createMarchAuthStorage({
    homeDir: dir,
    authStorage: {
      setRuntimeApiKey: () => {},
      list: () => ["openai-codex"],
    },
  });
  assert.equal(stored.hasAuth, true);
  cleanup(dir);
  console.log("  PASS");
}
