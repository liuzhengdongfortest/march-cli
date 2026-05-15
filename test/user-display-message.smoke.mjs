import { strict as assert } from "node:assert";

export async function runUserDisplayMessageSmoke() {
  console.log("--- smoke: user display message ---");
  const { formatUserDisplayMessage } = await import("../src/cli/repl-loop.mjs");

  const text = formatUserDisplayMessage("hello user");
  assert.ok(text.includes("\x1b[7m USER \x1b[0m"));
  assert.ok(text.includes("hello user"));
  assert.equal(text.includes("[user]"), false);

  console.log("  PASS");
}
