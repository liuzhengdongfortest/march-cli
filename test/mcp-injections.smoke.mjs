import { strict as assert } from "node:assert";

export async function runMcpInjectionsSmoke() {
  console.log("--- smoke: mcp injections ---");
  const { buildMcpInstructionsInjection } = await import("../src/mcp/index.mjs");

  assert.deepEqual(
    buildMcpInstructionsInjection("filesystem", {
      instructions: " Use this server only for workspace file operations. ",
    }),
    {
      type: "mcp_server",
      source: "filesystem",
      content: "Use this server only for workspace file operations.",
    },
  );
  assert.equal(buildMcpInstructionsInjection("empty", { instructions: "  " }), null);
  assert.equal(buildMcpInstructionsInjection("missing", {}), null);

  console.log("  PASS");
}
