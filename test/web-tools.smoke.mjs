import { strict as assert } from "node:assert";

export async function runWebToolsSmoke() {
  console.log("--- smoke: web tools ---");
  const { createWebTools } = await import("../src/web/tools.mjs");
  const tools = Object.fromEntries(createWebTools().map((tool) => [tool.name, tool]));
  const result = await tools.external_web_search.execute("tc-web-search", { query: "march" });
  assert.ok(result.content[0].text.includes("Search unavailable"));
  assert.ok(result.content[0].text.includes("Run: march websearch --config"));
  assert.equal(result.details.error, true);
  assert.equal(result.details.unavailable, true);

  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => {
      throw Object.assign(new Error("getaddrinfo ENOTFOUND example.com"), { code: "ENOTFOUND" });
    };
    const fetchResult = await tools.web_fetch.execute("tc-web-fetch", { url: "https://example.com" });
    assert.ok(fetchResult.content[0].text.includes("Fetch unavailable"));
    assert.equal(fetchResult.details.error, true);
    assert.equal(fetchResult.details.reason, "network_unavailable");
  } finally {
    globalThis.fetch = originalFetch;
  }

  console.log("  PASS");
}
