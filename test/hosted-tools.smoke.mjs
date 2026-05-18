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

  const xai = { provider: "supergrok-oauth", api: "openai-responses" };
  const xaiTools = resolveHostedTools(xai, { xai: { xSearch: false } });
  assert.deepEqual(xaiTools.map((tool) => tool.type), ["web_search"]);

  const custom = { provider: "custom", api: "openai-responses" };
  assert.equal(injectHostedTools({ input: [] }, custom).tools, undefined);
  console.log("  PASS");
}
