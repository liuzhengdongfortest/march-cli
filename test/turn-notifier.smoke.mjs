import { strict as assert } from "node:assert";
import { EventEmitter } from "node:events";
import { join } from "node:path";

export async function runTurnNotifierSmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: turn notifier ---");
  const { createDesktopTurnNotifier, buildWindowsBalloonScript, buildWindowsNotificationScript, buildWindowsToastOptions } = await import("../src/notification/desktop-notifier.mjs");
  const { createRunner } = await import("../src/agent/runner.mjs");
  const { handleSlashCommand } = await import("../src/cli/slash-commands.mjs");

  const toastCalls = [];
  const activations = [];
  const notifier = createDesktopTurnNotifier({
    platform: "win32",
    toastNotifier: {
      notify: (options, callback) => {
        toastCalls.push(options);
        setImmediate(() => callback(null, { activationType: "timeout" }));
      },
    },
    onActivation: (activation) => activations.push(activation),
  });
  const result = await notifier.notifyTurnEnd({ status: "success", sessionName: "Smoke", draft: "Smoke reply", durationMs: 25 });
  assert.equal(result.ok, true);
  assert.equal(result.results[0].channel, "desktop");
  assert.equal(toastCalls[0].title, "March");
  assert.equal(toastCalls[0].message, "Smoke reply");
  assert.ok(toastCalls[0].icon.endsWith("march-icon.png"));
  assert.equal(toastCalls[0].appID, "March");
  assert.equal(toastCalls[0].sound, true);
  assert.equal(toastCalls[0].wait, false);

  await notifier.notifyTurnEnd({ status: "success", draft: "Activated", activation: { type: "workspace-session", projectId: "p", sessionId: "s" } });
  assert.equal(toastCalls[1].wait, true);
  assert.deepEqual(toastCalls[1].activation, { type: "workspace-session", projectId: "p", sessionId: "s" });
  assert.deepEqual(activations, []);

  const spawned = [];
  const fallback = await createDesktopTurnNotifier({
    platform: "win32",
    toastNotifier: { notify: (_options, callback) => setImmediate(() => callback(new Error("toast failed"))) },
    spawnProcess: (command, args, options) => {
      spawned.push({ command, args, options });
      const child = new EventEmitter();
      child.stderr = new EventEmitter();
      setImmediate(() => child.emit("close", 0, null));
      return child;
    },
  }).notifyTurnEnd({ status: "success", draft: "Balloon fallback" });
  assert.equal(fallback.ok, true);
  assert.equal(fallback.results[0].fallback, "balloon");
  assert.equal(spawned[0].command, "powershell.exe");
  assert.ok(spawned[0].args.includes("-Command"));
  const notificationCommand = spawned[0].args[spawned[0].args.indexOf("-Command") + 1];
  assert.ok(notificationCommand.includes("$n.BalloonTipTitle = 'March'"));
  assert.ok(notificationCommand.includes("$n.BalloonTipText = 'Balloon fallback'"));
  assert.ok(notificationCommand.includes("march-icon.png"));
  assert.ok(notificationCommand.includes("[System.Drawing.Bitmap]::FromFile"));
  assert.ok(notificationCommand.includes("New-Object System.Drawing.Bitmap 32, 32"));
  assert.ok(notificationCommand.includes("$n.Text = 'March'"));
  assert.ok(notificationCommand.includes("$n.BalloonTipIcon = [System.Windows.Forms.ToolTipIcon]::None"));
  assert.ok(!spawned[0].args.includes("-WindowStyle"));
  assert.equal(spawned[0].options.detached, undefined);
  assert.equal(spawned[0].options.windowsHide, false);
  assert.deepEqual(spawned[0].options.stdio, ["ignore", "pipe", "pipe"]);

  assert.equal((await createDesktopTurnNotifier({ enabled: false }).notifyTurnEnd({})).reason, "disabled");
  assert.equal((await createDesktopTurnNotifier({ platform: "linux" }).notifyTurnEnd({})).reason, "unsupported-platform");
  assert.equal((await createDesktopTurnNotifier({ config: { minDurationMs: 50 } }).notifyTurnEnd({ durationMs: 10 })).reason, "min-duration");

  const customSoundCalls = [];
  await createDesktopTurnNotifier({
    platform: "win32",
    config: { sound: "ms-winsoundevent:Notification.IM" },
    toastNotifier: {
      notify: (options, callback) => {
        customSoundCalls.push(options);
        setImmediate(() => callback(null));
      },
    },
  }).notifyTurnEnd({ status: "success" });
  assert.equal(customSoundCalls[0].sound, "ms-winsoundevent:Notification.IM");

  const clickActivations = [];
  await createDesktopTurnNotifier({
    platform: "win32",
    toastNotifier: { notify: (_options, callback) => setImmediate(() => callback(null, "activate")) },
    onActivation: (activation) => clickActivations.push(activation),
  }).notifyTurnEnd({ status: "success", activation: { type: "workspace-session", projectId: "p-click", sessionId: "s-click" } });
  assert.deepEqual(clickActivations, [{ type: "workspace-session", projectId: "p-click", sessionId: "s-click" }]);

  const silentCalls = [];
  await createDesktopTurnNotifier({
    platform: "win32",
    config: { sound: false },
    toastNotifier: {
      notify: (options, callback) => {
        silentCalls.push(options);
        setImmediate(() => callback(null));
      },
    },
  }).notifyTurnEnd({ status: "success" });
  assert.equal(silentCalls[0].sound, false);

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
  const toastOptions = buildWindowsToastOptions({ title: "March's turn", message: "ready & waiting", iconPath: "C:\\tmp\\March's icon.png", sound: "ms-winsoundevent:Notification.Default" });
  assert.deepEqual(toastOptions, { title: "March's turn", message: "ready & waiting", icon: "C:\\tmp\\March's icon.png", appID: "March", sound: "ms-winsoundevent:Notification.Default", wait: false });
  assert.equal(buildWindowsToastOptions({ title: "x", message: "y", activation: { projectId: "p" } }).wait, true);
  const notificationScript = buildWindowsNotificationScript({ title: "March's turn", message: "ready & waiting", iconPath: "C:\\tmp\\March's icon.png" });
  assert.ok(notificationScript.includes("System.Windows.Forms.NotifyIcon"));
  assert.ok(notificationScript.includes("March''s turn"));
  assert.ok(notificationScript.includes("ready & waiting"));
  assert.ok(notificationScript.includes("C:\\tmp\\March''s icon.png"));
  assert.ok(notificationScript.includes("New-Object System.Drawing.Bitmap 32, 32"));

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
        events.push(["notify", event.status, event.errorMessage ?? event.draft ?? ""]);
        return { ok: true, results: [{ channel: "test", ok: true }] };
      },
    },
    createAgentSessionImpl: async () => ({ session: createFakeSession() }),
  });

  await runner.runTurn("ok", "ok");
  await flushPromises();
  assert.deepEqual(events.slice(-2), [["turnEnd"], ["notify", "success", "assistant reply"]]);
  assert.equal(runner.getLastNotificationResult().ok, true);

  await assert.rejects(() => runner.runTurn("fail", "fail"), /boom/);
  await flushPromises();
  assert.deepEqual(events.slice(-2), [["turnEnd"], ["notify", "error", "boom"]]);
  assert.equal(runner.getLastNotificationResult().ok, true);

  let releaseSlowNotify;
  let slowNotifyFinished = false;
  const slowRunner = await createRunner({
    cwd: dir,
    modelId: "deepseek-v4-pro",
    provider: "deepseek",
    stateRoot: join(dir, ".state-slow"),
    ui: createFakeUi([]),
    turnNotifier: {
      notifyTurnEnd: async () => {
        await new Promise((resolve) => { releaseSlowNotify = resolve; });
        slowNotifyFinished = true;
        return { ok: true, results: [{ channel: "slow", ok: true }] };
      },
    },
    createAgentSessionImpl: async () => ({ session: createFakeSession() }),
  });
  await slowRunner.runTurn("ok", "ok");
  assert.equal(slowNotifyFinished, false);
  assert.equal(slowRunner.getLastNotificationResult(), null);
  releaseSlowNotify();
  await waitFor(() => slowRunner.getLastNotificationResult()?.results?.[0]?.channel === "slow");
  assert.equal(slowNotifyFinished, true);

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
  await waitFor(() => resilientRunner.getLastNotificationResult()?.reason?.includes("notify failed"));
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

function flushPromises() {
  return new Promise((resolve) => setImmediate(resolve));
}

async function waitFor(predicate, { timeoutMs = 1000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await flushPromises();
  }
  assert.ok(predicate(), "condition was not met before timeout");
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
  let listener = () => {};
  return {
    agent: { state: { messages: [] }, onPayload: async (payload) => payload },
    model: { id: "deepseek-v4-pro", provider: "deepseek" },
    thinkingLevel: "medium",
    sessionManager: { isPersisted: () => false, getSessionFile: () => null },
    subscribe(callback) {
      listener = callback;
      return () => { listener = () => {}; };
    },
    async prompt(prompt) {
      if (prompt === "fail") throw new Error("boom");
      listener({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "assistant reply" } });
    },
    abort: () => true,
    getActiveToolNames: () => [],
    setActiveToolsByName: () => {},
    getToolDefinition: () => null,
    getSessionStats: () => ({ sessionId: "notify-session" }),
    dispose: () => {},
  };
}
