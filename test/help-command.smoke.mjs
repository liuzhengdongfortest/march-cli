import { strict as assert } from "node:assert";

export async function runHelpCommandSmoke() {
  console.log("--- smoke: help command formatting ---");
  const { formatHelpLines } = await import("../src/cli/help-command.mjs");
  const lines = formatHelpLines();
  const text = lines.join("\n");

  assert.equal(lines.length, 4);
  assert.ok(text.includes("/help"));
  assert.ok(text.includes("/resume-pi <id>"));
  assert.ok(text.includes("/sessions legacy"));
  assert.ok(text.includes("/clone-pi"));
  assert.ok(text.includes("Ctrl+C"));
  assert.ok(text.includes("Alt+S"));
  console.log("  PASS");
}
