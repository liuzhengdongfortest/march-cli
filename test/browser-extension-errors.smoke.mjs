import { strict as assert } from "node:assert";
import { serializeError } from "../src/browser/extension/errors.js";

export async function runBrowserExtensionErrorsSmoke() {
  console.log("--- smoke: browser extension error serialization ---");

  assert.equal(serializeError("plain failure").message, "plain failure");
  assert.equal(serializeError(new Error("boom")).message, "boom");
  assert.equal(serializeError({ code: "E_CHROME", detail: "permission denied" }).message, JSON.stringify({ code: "E_CHROME", detail: "permission denied" }));
  assert.equal(serializeError({ message: { code: "E_CHROME" } }).message, JSON.stringify({ code: "E_CHROME" }));

  console.log("  PASS");
}
