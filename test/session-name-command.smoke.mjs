import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export async function runSessionNameCommandSmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: session name command ---");
  const {
    handleSessionNameCommand,
    parseSessionNameCommand,
  } = await import("../src/cli/session-name-command.mjs");

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
  assert.deepEqual(handleSessionNameCommand(parseSessionNameCommand("/name Demo"), { runner, sessionSource: "pi" }), ["Session named: Demo"]);
  assert.deepEqual(calls, ["Demo"]);

  const dir = setupTmp();
  const sessionDir = join(dir, "sessions", "s1");
  const legacyRunner = {
    engine: {
      cwd: dir,
      modelId: "m",
      provider: "p",
      thinkingLevel: "medium",
      turns: [],
      _compactionSummary: null,
      pins: new Set(),
      skills: [],
      openFiles: new Map(),
      setSessionName(name) { this.sessionName = name; },
    },
  };
  assert.deepEqual(handleSessionNameCommand(parseSessionNameCommand("/name Legacy"), {
    runner: legacyRunner,
    sessionState: { sessionDir },
    sessionSource: "legacy",
  }), ["Session named: Legacy"]);
  assert.equal(existsSync(join(sessionDir, "session.json")), true);
  assert.equal(JSON.parse(readFileSync(join(sessionDir, "session.json"), "utf8")).sessionName, "Legacy");
  cleanup(dir);
  console.log("  PASS");
}
