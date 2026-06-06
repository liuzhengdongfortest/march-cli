import { strict as assert } from "node:assert";
import { AuthStorage, ModelRegistry } from "@earendil-works/pi-coding-agent";

export async function runProviderEnvIsolationSmoke() {
  console.log("--- smoke: provider env isolation ---");
  const { createMarchAuthStorage } = await import("../src/auth/storage.mjs");
  const { registerCustomProviders } = await import("../src/provider/custom-provider.mjs");
  const { resolveInitialModel } = await import("../src/agent/runner/runner-init.mjs");

  const previousAnthropicKey = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = "ambient-anthropic-key";
  try {
    const emptyAuth = createMarchAuthStorage({ authStorage: AuthStorage.inMemory({}), providers: {} });
    assert.equal(emptyAuth.hasAuth, false);
    assert.equal(emptyAuth.authStorage.hasAuth("anthropic"), false);
    assert.equal(await emptyAuth.authStorage.getApiKey("anthropic"), undefined);
    assert.equal(ModelRegistry.create(emptyAuth.authStorage).getAvailable().some((model) => model.provider === "anthropic"), false);

    const envRefAuth = createMarchAuthStorage({
      authStorage: AuthStorage.inMemory({ anthropic: { type: "api_key", key: "$ANTHROPIC_API_KEY" } }),
      providers: {},
    });
    assert.equal(envRefAuth.hasAuth, false);
    assert.equal(envRefAuth.authStorage.hasAuth("anthropic"), false);
    assert.equal(await envRefAuth.authStorage.getApiKey("anthropic"), undefined);

    const runtimeEnvRefAuth = createMarchAuthStorage({ authStorage: AuthStorage.inMemory({}), providers: {} });
    runtimeEnvRefAuth.authStorage.setRuntimeApiKey("anthropic", "$ANTHROPIC_API_KEY");
    assert.equal(runtimeEnvRefAuth.authStorage.hasAuth("anthropic"), false);
    assert.equal(await runtimeEnvRefAuth.authStorage.getApiKey("anthropic"), undefined);

    const providers = {
      local: {
        type: "openai-compatible",
        baseUrl: "http://localhost:1234/v1",
        auth: { method: "apiKey", apiKey: "local-key" },
        models: [{ id: "qwen-coder" }],
      },
    };
    const customAuth = createMarchAuthStorage({ authStorage: AuthStorage.inMemory({}), providers });
    const registry = ModelRegistry.create(customAuth.authStorage);
    registerCustomProviders(registry, providers);

    assert.equal(customAuth.hasAuth, true);
    assert.equal(registry.getAvailable().some((model) => model.provider === "anthropic"), false);
    assert.equal(registry.getAvailable().some((model) => model.provider === "local"), true);

    const selected = resolveInitialModel({ modelRegistry: registry, provider: null, modelId: null, providers });
    assert.equal(selected?.provider, "local");
    assert.equal(selected?.id, "qwen-coder");
  } finally {
    if (previousAnthropicKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = previousAnthropicKey;
  }
  console.log("  PASS");
}
