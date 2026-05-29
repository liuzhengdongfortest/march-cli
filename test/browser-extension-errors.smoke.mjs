import { strict as assert } from "node:assert";
import { formatExtensionError } from "../src/browser/daemon/server.mjs";
import { buildExecCode } from "../src/browser/extension/execute-code.js";
import { BROWSER_OUTPUT_CHAR_LIMIT, truncateToolText } from "../src/browser/extension/output-limits.js";
import { serializeError } from "../src/browser/extension/errors.js";

export async function runBrowserExtensionErrorsSmoke() {
  console.log("--- smoke: browser extension error serialization ---");

  assert.equal(serializeError("plain failure").message, "plain failure");
  assert.equal(serializeError(new Error("boom")).message, "boom");
  assert.equal(serializeError({ code: "E_CHROME", detail: "permission denied" }).message, JSON.stringify({ code: "E_CHROME", detail: "permission denied" }));
  assert.equal(serializeError({ message: { code: "E_CHROME" } }).message, JSON.stringify({ code: "E_CHROME" }));
  assert.equal(formatExtensionError({ message: { code: "E_CHROME" } }), JSON.stringify({ code: "E_CHROME" }));
  assert.doesNotThrow(() => new Function(`return ${buildExecCode("return document.title")}`));
  assert.doesNotThrow(() => new Function(`return ${buildExecCode("// comment")}`));

  const longScriptResult = await new Function(`return ${buildExecCode("return 'x'.repeat(12000)")}`)();
  assert.equal(longScriptResult.ok, true);
  assert.ok(longScriptResult.data.length <= BROWSER_OUTPUT_CHAR_LIMIT);
  assert.match(longScriptResult.data, /truncated browser output/);

  const multiStringResult = await new Function(`return ${buildExecCode("return { a: 'x'.repeat(8000), b: 'y'.repeat(8000) }")}`)();
  assert.equal(multiStringResult.ok, true);
  assert.ok(JSON.stringify(multiStringResult.data).length < BROWSER_OUTPUT_CHAR_LIMIT + 1000);

  const longArrayResult = await new Function(`return ${buildExecCode("return Array.from({ length: 150 }, (_, index) => index)")}`)();
  assert.equal(longArrayResult.ok, true);
  assert.equal(longArrayResult.data.length, 101);
  assert.match(longArrayResult.data.at(-1), /150 items -> 100 items/);

  const circularResult = await new Function(`return ${buildExecCode("const value = {}; value.self = value; return value;")}`)();
  assert.equal(circularResult.ok, true);
  assert.equal(circularResult.data.self, "[Circular]");

  const limitedToolText = truncateToolText("x".repeat(12000));
  assert.equal(limitedToolText.truncated, true);
  assert.ok(limitedToolText.text.length <= BROWSER_OUTPUT_CHAR_LIMIT);
  assert.match(limitedToolText.text, /truncated browser tool output/);

  console.log("  PASS");
}
