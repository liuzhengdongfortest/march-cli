import { strict as assert } from "node:assert";
import { join } from "node:path";

export async function runSessionNameCommandSmoke() {
  console.log("--- smoke: session name command ---");
  const {
    handleSessionNameCommand,
    parseSessionNameCommand,
  } = await import("../src/cli/session/session-name-command.mjs");
  const { generateSessionName, maybeAutoNameSession } = await import("../src/agent/session/session-auto-name.mjs");

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

  assert.equal(generateSessionName({ userMessage: "please fix the session resume bug" }), "fix the session resume bug");
  assert.equal(generateSessionName({ userMessage: "   " }), "New session");

  const autoCalls = [];
  const autoEngine = {
    sessionName: "",
    turns: [{ userMessage: "help me add automatic naming", assistantMessage: "ok" }],
  };
  assert.equal(maybeAutoNameSession({
    engine: autoEngine,
    session: {},
    setSessionName: (name) => {
      autoCalls.push(name);
      autoEngine.sessionName = name;
      return name;
    },
  }), "add automatic naming");
  assert.deepEqual(autoCalls, ["add automatic naming"]);
  assert.equal(maybeAutoNameSession({ engine: autoEngine, session: {}, setSessionName: () => "ignored" }), null);
  console.log("  PASS");
}
