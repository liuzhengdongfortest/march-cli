import { strict as assert } from "node:assert";

export async function runHelpCommandSmoke() {
  console.log("--- smoke: help command formatting ---");
  const { formatHelpLines } = await import("../src/cli/commands/help-command.mjs");
  const lines = formatHelpLines();
  const text = lines.join("\n");

  assert.equal(lines.length, 3);
  assert.ok(text.includes("/help"));
  assert.ok(text.includes("/session"));
  assert.ok(text.includes("/do"));
  assert.ok(text.includes("/discuss"));
  assert.ok(text.includes("/mode"));
  assert.ok(text.includes("restores the selected one"));
  assert.ok(!text.includes("/resume-pi"));
  assert.ok(!text.includes("/clone-pi"));
  assert.ok(!text.includes("/fork-pi"));
  assert.ok(text.includes("Ctrl+C"));
  assert.ok(text.includes("Alt+S"));
  console.log("  PASS");
}
