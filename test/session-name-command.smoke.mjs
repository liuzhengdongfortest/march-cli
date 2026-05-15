import { strict as assert } from "node:assert";
import { join } from "node:path";

export async function runSessionNameCommandSmoke() {
  console.log("--- smoke: session name command ---");
  const {
    handleSessionNameCommand,
    parseSessionNameCommand,
  } = await import("../src/cli/session/session-name-command.mjs");

  assert.deepEqual(parseSessionNameCommand("hello"), { type: "none" });
  assert.deepEqual(parseSessionNameCommand("/name"), { type: "show" });
  assert.deepEqual(parseSessionNameCommand("/name Sprint Plan"), { type: "set", name: "Sprint Plan" });
  assert.equal(parseSessionNameCommand(`/name ${"x".repeat(121)}`).type, "error");

  const calls = [];
  const runner = {
    engine: { sessionName: "" },
    setSessionName: (name) => {
      calls.push(name);
      runner.engine.sessionName = name;
      return name;
    },
  };
  assert.deepEqual(handleSessionNameCommand({ type: "show" }, { runner }), ["Session name: (unnamed)"]);
  assert.deepEqual(handleSessionNameCommand(parseSessionNameCommand("/name Demo"), { runner }), ["Session named: Demo"]);
  assert.deepEqual(calls, ["Demo"]);
  console.log("  PASS");
}
