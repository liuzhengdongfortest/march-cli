import { strict as assert } from "node:assert";
import { EventEmitter } from "node:events";
import { join } from "node:path";

export async function runTurnNotifierSmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: turn notifier ---");
  const { createDesktopTurnNotifier, buildWindowsBalloonScript, buildWindowsNotificationScript } = await import("../src/notification/desktop-notifier.mjs");
  const { createRunner } = await import("../src/agent/runner.mjs");
  const { handleSlashCommand } = await import("../src/cli/slash-commands.mjs");

  const spawned = [];
  const notifier = createDesktopTurnNotifier({
    platform: "win32",
    spawnProcess: (command, args, options) => {
      spawned.push({ command, args, options });
      const child = new EventEmitter();
      child.stderr = new EventEmitter();
      setImmediate(() => child.emit("close", 0, null));
      return child;
    }
  });
  const result = await notifier.notifyTurnEnd({ status: "success", sessionName: "Smoke", durationMs: 25 });
  assert.equal(result.ok, true);
  assert.equal(result.results[0].channel, "desktop");
  assert.equal(spawned[0].command, "powershell.exe");
  assert.ok(spawned[0].args.includes("-Command"));
  assert.ok(!spawned[0].args.includes("-WindowStyle"));
  assert.equal(spawned[0].options.detached, undefined);
  assert.equal(spawned[0].options.windowsHide, false);
  assert.deepEqual(spawned[0].options.stdio, ["ignore", "pipe", "pipe"]);

  assert.equal((await createDesktopTurnNotifier({ enabled: false }).notifyTurnEnd({})).reason, "disabled");
  assert.equal((await createDesktopTurnNotifier({ platform: "linux" }).notifyTurnEnd({})).reason, "unsupported-platform");
  assert.equal((await createDesktopTurnNotifier({ config: { minDurationMs: 50 } }).notifyTurnEnd({ durationMs: 10 })).reason, "min-duration");

  let bellText = "";
  const bellOnly = await createDesktopTurnNotifier({
    config: { desktop: false, bell: true },
    writeBell: (text) => { bellText += text; },
  }).notifyTurnEnd({ status: "success" });
  assert.equal(bellOnly.ok, true);
  assert.equal(bellOnly.results[0].channel, "bell");
  assert.equal(bellText, "\x07");

  const commandSpawned = [];
  const commandOnly = await createDesktopTurnNotifier({
    config: { desktop: false, command: "echo notify" },
    spawnProcess: (command, args, options) => {
      commandSpawned.push({ command, args, options });
      return { unref: () => {} };
    },
  }).notifyTurnEnd({ status: "error", sessionName: "Cmd", durationMs: 123, errorMessage: "bad" });
  assert.equal(commandOnly.ok, true);
  assert.equal(commandOnly.results[0].channel, "command");
  assert.equal(commandSpawned[0].command, "echo notify");
  assert.equal(commandSpawned[0].options.shell, true);
  assert.equal(commandSpawned[0].options.env.MARCH_NOTIFICATION_STATUS, "error");
  assert.equal(commandSpawned[0].options.env.MARCH_NOTIFICATION_SESSION, "Cmd");
  assert.ok(buildWindowsBalloonScript({ title: "March's turn", message: "done" }).includes("March''s turn"));
  const notificationScript = buildWindowsNotificationScript({ title: "March's turn", message: "ready & waiting" });
  assert.ok(notificationScript.includes("System.Windows.Forms.NotifyIcon"));
  assert.ok(notificationScript.includes("March''s turn"));
  assert.ok(notificationScript.includes("ready & waiting"));

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
      notifyTurnEnd: async (event) => {
        events.push(["notify", event.status, event.errorMessage ?? ""]);
        return { ok: true, results: [{ channel: "test", ok: true }] };
      },
    },
    createAgentSessionImpl: async () => ({ session: createFakeSession() }),
  });

  await runner.runTurn("ok", "ok");
  assert.deepEqual(events.slice(-2), [["turnEnd"], ["notify", "success", ""]]);
  assert.equal(runner.getLastNotificationResult().ok, true);

  await assert.rejects(() => runner.runTurn("fail", "fail"), /boom/);
  assert.deepEqual(events.slice(-2), [["turnEnd"], ["notify", "error", "boom"]]);
  assert.equal(runner.getLastNotificationResult().ok, true);

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
  assert.match(resilientRunner.getLastNotificationResult().reason, /notify failed/);

  const slashLines = [];
  await handleSlashCommand("/notify", {
    ui: { writeln: (line) => slashLines.push(line) },
    runner: {
      notifyTest: async () => ({ ok: true, results: [{ channel: "desktop", ok: true }] }),
    },
  });
  assert.deepEqual(slashLines, ["notification: ok (desktop:ok)"]);

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
