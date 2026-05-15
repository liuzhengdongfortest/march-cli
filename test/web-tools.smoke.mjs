import { strict as assert } from "node:assert";

export async function runWebToolsSmoke() {
  console.log("--- smoke: web tools ---");
  const { createWebTools } = await import("../src/web/tools.mjs");
  const tools = Object.fromEntries(createWebTools().map((tool) => [tool.name, tool]));
  const result = await tools.web_search.execute("tc-web-search", { query: "march" });
  assert.ok(result.content[0].text.includes("Run: march websearch --config"));
  assert.equal(result.details.error, true);
  console.log("  PASS");
}
