import { strict as assert } from "node:assert";

export async function runSessionSourceCommandSmoke() {
  console.log("--- smoke: session source slash command handling ---");
  const { handleSessionSourceCommand } = await import("../src/cli/session/session-source-command.mjs");

  const output = [];
  const ui = { writeln: (text) => output.push(text) };
  const runner = { getSessionStats: () => ({ sessionId: "pi-slash" }) };
  const sessionState = { sessionId: "s1" };

  assert.equal((await handleSessionSourceCommand("/session", { ui, runner, sessionState })).handled, false);
  assert.equal((await handleSessionSourceCommand("/sessions", { ui, runner, sessionState })).handled, false);
  assert.equal((await handleSessionSourceCommand("/session entries", { ui, runner, sessionState })).handled, false);

  const save = await handleSessionSourceCommand("/save", { ui, runner, sessionState });
  assert.equal(save.handled, true);
  assert.ok(output.join("\n").includes("Pi session auto-saved: pi-slash"));
  assert.equal((await handleSessionSourceCommand("/unknown", { ui, runner, sessionState })).handled, false);

  console.log("  PASS");
}
