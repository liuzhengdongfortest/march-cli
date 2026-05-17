import { strict as assert } from "node:assert";
import { join } from "node:path";

export async function runTurnNotifierSmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: turn notifier ---");
  const { createDesktopTurnNotifier, buildWindowsBalloonScript } = await import("../src/notification/desktop-notifier.mjs");
  const { createRunner } = await import("../src/agent/runner.mjs");

  const spawned = [];
  const notifier = createDesktopTurnNotifier({
    platform: "win32",
    spawnProcess: (command, args, options) => {
      spawned.push({ command, args, options });
      return { unref: () => spawned.push({ unref: true }) };
    },
  });
  const result = await notifier.notifyTurnEnd({ status: "success", sessionName: "Smoke" });
  assert.equal(result.ok, true);
  assert.equal(spawned[0].command, "powershell.exe");
  assert.ok(spawned[0].args.includes("-Command"));
  assert.equal(spawned[0].options.detached, true);
  assert.deepEqual(spawned[1], { unref: true });

  assert.equal((await createDesktopTurnNotifier({ enabled: false }).notifyTurnEnd({})).reason, "disabled");
  assert.equal((await createDesktopTurnNotifier({ platform: "linux" }).notifyTurnEnd({})).reason, "unsupported-platform");
  assert.ok(buildWindowsBalloonScript({ title: "March's turn", message: "done" }).includes("March''s turn"));

  const dir = setupTmp();
  const previousKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = previousKey || "test-key";
  const events = [];
  const runner = await createRunner({
    cwd: dir,
    modelId: "deepseek-v4-pro",
    provider: "deepseek",
    stateRoot: join(dir, ".state"),
    ui: createFakeUi(events),
    turnNotifier: {
      notifyTurnEnd: async (event) => events.push(["notify", event.status, event.errorMessage ?? ""]),
    },
    createAgentSessionImpl: async () => ({ session: createFakeSession() }),
  });

  await runner.runTurn("ok", "ok");
  assert.deepEqual(events.slice(-2), [["turnEnd"], ["notify", "success", ""]]);

  await assert.rejects(() => runner.runTurn("fail", "fail"), /boom/);
  assert.deepEqual(events.slice(-2), [["turnEnd"], ["notify", "error", "boom"]]);

  const resilientRunner = await createRunner({
    cwd: dir,
    modelId: "deepseek-v4-pro",
    provider: "deepseek",
    stateRoot: join(dir, ".state2"),
    ui: createFakeUi([]),
    turnNotifier: { notifyTurnEnd: async () => { throw new Error("notify failed"); } },
    createAgentSessionImpl: async () => ({ session: createFakeSession() }),
  });
  await resilientRunner.runTurn("still ok", "still ok");

  if (previousKey === undefined) {
    delete process.env.DEEPSEEK_API_KEY;
  } else {
    process.env.DEEPSEEK_API_KEY = previousKey;
  }
  cleanup(dir);
  console.log("  PASS");
}

function createFakeUi(events) {
  return {
    turnStart: () => events.push(["turnStart"]),
    turnEnd: () => events.push(["turnEnd"]),
    textDelta: () => {},
    assistantReplyEnd: () => {},
  };
}

function createFakeSession() {
  return {
    agent: { state: { messages: [] }, onPayload: async (payload) => payload },
    model: { id: "deepseek-v4-pro", provider: "deepseek" },
    thinkingLevel: "medium",
    sessionManager: { isPersisted: () => false, getSessionFile: () => null },
    subscribe() { return () => {}; },
    async prompt(prompt) {
      if (prompt === "fail") throw new Error("boom");
    },
    abort: () => true,
    getActiveToolNames: () => [],
    setActiveToolsByName: () => {},
    getToolDefinition: () => null,
    getSessionStats: () => ({ sessionId: "notify-session" }),
    dispose: () => {},
  };
}
