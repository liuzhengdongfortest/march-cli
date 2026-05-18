import { strict as assert } from "node:assert";

export async function runCustomProviderSmoke() {
  console.log("--- smoke: custom provider registry ---");
  const { registerCustomProviders } = await import("../src/provider/custom-provider.mjs");

  const calls = [];
  const registered = registerCustomProviders({
    registerProvider: (provider, config) => calls.push([provider, config]),
  }, {
    openai: { type: "openai", auth: { method: "apiKey", apiKey: "openai-key" } },
    local: {
      type: "openai-compatible",
      name: "Local Qwen",
      baseUrl: "http://localhost:1234/v1",
      api: "openai-completions",
      auth: { method: "apiKey", apiKey: "local-key" },
      headers: { "X-Test": "yes", ignored: 123 },
      models: [
        { id: "qwen-coder", contextWindow: 128000, maxTokens: 8192 },
      ],
    },
  });

  assert.deepEqual(registered, ["local"]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "local");
  assert.deepEqual(calls[0][1], {
    name: "Local Qwen",
    baseUrl: "http://localhost:1234/v1",
    apiKey: "local-key",
    api: "openai-completions",
    headers: { "X-Test": "yes" },
    models: [{
      id: "qwen-coder",
      contextWindow: 128000,
      maxTokens: 8192,
      name: "qwen-coder",
      api: "openai-completions",
      baseUrl: "http://localhost:1234/v1",
      reasoning: false,
      input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    }],
  });

  calls.length = 0;
  registerCustomProviders({ registerProvider: (provider, config) => calls.push([provider, config]) }, {
    vision: { type: "openai-compatible", baseUrl: "http://localhost:1234/v1", models: [{ id: "vision-model", capabilities: { images: true } }] },
  });
  assert.deepEqual(calls[0][1].models[0].input, ["text", "image"]);

  assert.throws(
    () => registerCustomProviders({ registerProvider: () => {} }, {
      bad: { type: "openai-compatible", baseUrl: "http://localhost:1234/v1", models: [{ id: "m", api: "other" }] },
    }),
    /api must be/,
  );
  console.log("  PASS");
}
