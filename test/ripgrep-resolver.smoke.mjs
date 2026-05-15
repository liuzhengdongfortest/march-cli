import { strict as assert } from "node:assert";

export async function runRipgrepResolverSmoke() {
  console.log("--- smoke: bundled ripgrep resolver ---");
  const { resolveBundledRipgrepPath, resolveRipgrepCommand } = await import("../src/memory/markdown/ripgrep.mjs");

  const resolved = resolveBundledRipgrepPath({
    platform: "win32",
    arch: "x64",
    requireResolve: (id) => `resolved:${id}`,
  });
  assert.equal(resolved, "resolved:@vscode/ripgrep-win32-x64/bin/rg.exe");

  const missing = resolveBundledRipgrepPath({
    platform: "linux",
    arch: "x64",
    requireResolve: () => { throw new Error("missing"); },
  });
  assert.equal(missing, null);

  const fallback = resolveRipgrepCommand({
    requireResolve: () => { throw new Error("missing"); },
  });
  assert.equal(fallback, "rg");

  console.log("  PASS");
}
