import { strict as assert } from "node:assert";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export async function runCodeSearchSmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: code search ---");
  const root = setupTmp();
  try {
    mkdirSync(join(root, "src"), { recursive: true });
    mkdirSync(join(root, "test"), { recursive: true });
    writeFileSync(join(root, "src", "auth-service.mjs"), [
      "export function issueSessionToken(user) {",
      "  const token = signJwt({ subject: user.id });",
      "  return { token, expiresIn: 3600 };",
      "}",
      "",
      "function signJwt(payload) {",
      "  return JSON.stringify(payload);",
      "}",
    ].join("\n"));
    writeFileSync(join(root, "test", "auth-service.test.mjs"), "assert.equal(issueSessionToken(user).token, expectedToken);\n");

    const { searchCode } = await import("../src/agent/code-search/engine.mjs");
    const result = await searchCode({ root, query: "issue session token", top_k: 3 });
    assert.ok(result.stats.files >= 1);
    assert.ok(result.stats.chunks >= 1);
    assert.equal(result.results[0].file_path, "src/auth-service.mjs");
    assert.equal(result.results[0].kind, "function");
    assert.match(result.results[0].snippet, /issueSessionToken/);

    const fileScoped = await searchCode({ root, path: "src/auth-service.mjs", query: "sign jwt payload", top_k: 1 });
    assert.equal(fileScoped.results[0].file_path, "src/auth-service.mjs");

    await assert.rejects(() => searchCode({ root, path: "..", query: "outside" }), /escapes workspace/);

    const { executeCodeSearch } = await import("../src/agent/code-search/tool.mjs");
    const toolResult = await executeCodeSearch({
      engine: { cwd: root, resolvePath: (path) => join(root, path) },
      query: "sign jwt payload",
      top_k: 1,
    });
    assert.match(toolResult.content[0].text, /code_search/);
    assert.equal(toolResult.details.results.length, 1);
  } finally {
    cleanup(root);
  }
  console.log("  PASS");
}
