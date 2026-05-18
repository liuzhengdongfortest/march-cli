import { strict as assert } from "node:assert";

export async function runHostedToolsSmoke() {
  console.log("--- smoke: hosted tool overlay ---");
  const {
    injectHostedTools,
    resolveHostedToolCapabilities,
    resolveHostedTools,
  } = await import("../src/provider/hosted-tools.mjs");

  const openai = { provider: "openai", api: "openai-responses" };
  assert.deepEqual(resolveHostedToolCapabilities(openai), ["openai.webSearch"]);
  assert.deepEqual(resolveHostedTools(openai), [{ type: "web_search_preview" }]);
  assert.deepEqual(resolveHostedTools(openai, { openai: { webSearch: false } }), []);

  const payload = injectHostedTools({ input: [], tools: [{ type: "function", name: "read" }] }, openai);
  assert.deepEqual(payload.tools.map((tool) => tool.type), ["function", "web_search_preview"]);

  const nested = injectHostedTools({ body: { input: [] } }, openai);
  assert.deepEqual(nested.body.tools, [{ type: "web_search_preview" }]);

  const azure = { provider: "azure-openai-responses", api: "azure-openai-responses" };
  assert.deepEqual(resolveHostedToolCapabilities(azure), ["azureOpenai.webSearch"]);
  assert.deepEqual(injectHostedTools({ input: [] }, azure).tools, [{ type: "web_search_preview" }]);

  const anthropic = { provider: "anthropic", api: "anthropic-messages" };
  assert.deepEqual(resolveHostedToolCapabilities(anthropic), ["anthropic.webSearch"]);
  assert.deepEqual(injectHostedTools({ messages: [] }, anthropic).tools, [
    { type: "web_search_20250305", name: "web_search" },
  ]);
  assert.equal(injectHostedTools({ messages: [] }, anthropic, { anthropic: { webSearch: false } }).tools, undefined);

  const google = { provider: "google", api: "google-generative-ai" };
  assert.deepEqual(resolveHostedToolCapabilities(google), ["google.webSearch"]);
  assert.deepEqual(injectHostedTools({ contents: [], config: {} }, google).config.tools, [{ googleSearch: {} }]);

  const vertex = { provider: "google-vertex", api: "google-vertex" };
  assert.deepEqual(resolveHostedToolCapabilities(vertex), ["google.webSearch"]);
  assert.deepEqual(
    injectHostedTools({ contents: [], config: { tools: [{ functionDeclarations: [] }] } }, vertex).config.tools,
    [{ functionDeclarations: [] }, { googleSearch: {} }],
  );

  const xai = { provider: "supergrok-oauth", api: "openai-responses" };
  const xaiTools = resolveHostedTools(xai, { xai: { xSearch: false } });
  assert.deepEqual(xaiTools.map((tool) => tool.type), ["web_search"]);

  const custom = { provider: "custom", api: "openai-responses" };
  assert.equal(injectHostedTools({ input: [] }, custom).tools, undefined);
  console.log("  PASS");
}
