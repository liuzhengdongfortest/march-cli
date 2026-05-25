import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
export async function runGatewayCoreSmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: gateway core ---");
  const cwd = setupTmp();
  try {
    const { normalizeGatewayConfig } = await import("../src/gateway/config.mjs");
    const { normalizeGatewayMessage, gatewaySessionKey } = await import("../src/gateway/message.mjs");
    const { GatewaySessionStore } = await import("../src/gateway/session-store.mjs");
    const { handleGatewaySlashCommand } = await import("../src/gateway/command-router.mjs");
    const { createGatewayMessageHandler } = await import("../src/gateway/handler.mjs");
    const { runGatewayCommand } = await import("../src/gateway/command.mjs");
    const { GatewayPlatformRegistry, createDefaultGatewayPlatformRegistry } = await import("../src/gateway/platform-registry.mjs");
    const { createTelegramPlatformAdapter, normalizeTelegramUpdate, splitTelegramLines } = await import("../src/gateway/platforms/telegram.mjs");
    const { createGatewayRunnerBridge } = await import("../src/gateway/runner-bridge.mjs");
    const { createGatewayMessageQueue } = await import("../src/gateway/runtime/queue.mjs");
    const { runGatewaySetupCommand, upsertEnvFile } = await import("../src/gateway/setup/command.mjs");
    const { sendBinaryOutput } = await import("../src/agent/output/binary-output-sink.mjs");
    const gatewayConfig = normalizeGatewayConfig({
      gateway: {
        defaultWorkspace: "main",
        workspaces: {
          main: ".",
          other: "../other-project",
        },
      },
    }, { cwd });
    const message = normalizeGatewayMessage({ platform: "telegram", chat_id: 1001, user_id: 42, text: "  hello  " });
    assert.equal(message.text, "hello");
    assert.equal(gatewaySessionKey(message), "telegram:chat:1001");

    const store = new GatewaySessionStore({ gatewayConfig });
    const session = store.getOrCreate(message);
    assert.equal(session.modeState.get(), "discuss");
    assert.equal(session.workspaceAlias, "main");
    assert.equal(session.workspaceRoot, cwd);
    assert.equal(store.getOrCreate(message), session);

    const workspaceResult = await handleGatewaySlashCommand("/workspace set other", {
      runner: {},
      session,
      sessionStore: store,
    });
    assert.equal(workspaceResult.handled, true);
    assert.equal(session.workspaceAlias, "other");
    assert.equal(session.workspaceRoot, join(cwd, "..", "other-project"));
    assert.match(workspaceResult.lines[0], /^Workspace: other /);

    const modeResult = await handleGatewaySlashCommand("/do", {
      runner: {},
      session,
      sessionStore: store,
    });
    assert.equal(modeResult.handled, true);
    assert.equal(session.modeState.get(), "do");
    assert.deepEqual(modeResult.lines, []);

    const calls = [];
    const binarySends = [];
    const handler = createGatewayMessageHandler({
      sessionStore: store,
      currentProject: "project",
      outputSinkForMessage: (message) => ({
        sendBinary: async (binary) => {
          binarySends.push({ chatId: message.chatId, binary });
          return { target: "gateway-test" };
        },
      }),
      getRunner: async () => ({
        async runTurn(prompt, userMessage, options) {
          calls.push({ prompt, userMessage, options });
          await sendBinaryOutput({ type: "image", url: "https://example.com/image.png" });
          return { draft: "ok" };
        },
      }),
    });
    const turnResult = await handler({ platform: "telegram", chatId: "1001", userId: "42", text: "build a plan" });
    assert.equal(turnResult.type, "turn");
    assert.deepEqual(turnResult.lines, ["ok"]);
    assert.equal(calls[0].userMessage, "build a plan");
    assert.equal(calls[0].options.currentProject, "project");
    assert.deepEqual(binarySends, [{ chatId: "1001", binary: { type: "image", url: "https://example.com/image.png" } }]);
    assert.match(calls[0].prompt, /<mode>\nYou are in do mode/);

    assert.deepEqual(normalizeTelegramUpdate({
      update_id: 7,
      message: { message_id: 8, date: 1700000000, text: " /mode ", from: { id: 42 }, chat: { id: 1001, type: "private" } },
    }, { allowedUsers: new Set(["42"]) }), {
      platform: "telegram",
      chatId: "1001",
      userId: "42",
      messageId: "8",
      text: "/mode",
      receivedAt: "2023-11-14T22:13:20.000Z",
    });
    assert.equal(normalizeTelegramUpdate({ message: { text: "hi", from: { id: 7 }, chat: { id: 1001, type: "private" } } }, { allowedUsers: new Set(["42"]) }), null);
    assert.equal(normalizeTelegramUpdate({ message: { text: "hi", from: { id: 42 }, chat: { id: -1, type: "group" } } }, { allowedUsers: new Set(["42"]) }), null);
    assert.equal(splitTelegramLines(["a", "b"])[0], "a\nb");
    assert.equal(splitTelegramLines("x".repeat(4001)).length, 2);

    const fetchCalls = [];
    const telegram = createTelegramPlatformAdapter({
      config: { token: "test-token", allowedUsers: ["42"], pollTimeoutSeconds: 1 },
      fetchImpl: async (url, init) => {
        const body = JSON.parse(init.body);
        fetchCalls.push({ url, body });
        if (url.endsWith("/getUpdates")) {
          return jsonResponse({ ok: true, result: [
            { update_id: 10, message: { message_id: 11, date: 1700000000, text: "hello", from: { id: 42 }, chat: { id: 1001, type: "private" } } },
            { update_id: 11, message: { message_id: 12, date: 1700000000, text: "blocked", from: { id: 7 }, chat: { id: 1001, type: "private" } } },
          ] });
        }
        return jsonResponse({ ok: true, result: {} });
      },
    });
    const telegramMessages = [];
    const updateCount = await telegram.pollOnce({
      handleMessage: async (telegramMessage) => {
        telegramMessages.push(telegramMessage);
        return { lines: ["reply"] };
      },
    });
    assert.equal(updateCount, 2);
    assert.equal(telegramMessages.length, 1);
    assert.equal(telegramMessages[0].text, "hello");
    assert.equal(fetchCalls.at(-1).body.reply_to_message_id, 11);
    assert.equal(fetchCalls.at(-1).body.text, "reply");
    const sendPhotoResult = await telegram.sendBinary({
      chatId: "1001",
      replyToMessageId: "11",
      binary: { type: "image", url: "https://example.com/image.png", caption: "caption" },
    });
    assert.deepEqual(sendPhotoResult, { target: "telegram", method: "sendPhoto", source: "url" });
    assert.ok(fetchCalls.at(-1).url.endsWith("/sendPhoto"));
    assert.equal(fetchCalls.at(-1).body.photo, "https://example.com/image.png");
    assert.equal(fetchCalls.at(-1).body.caption, "caption");

    const queueGate = deferred();
    const queueHandled = [];
    const queueSent = [];
    const queue = createGatewayMessageQueue({
      handleMessage: async (queuedMessage) => {
        queueHandled.push(queuedMessage.text);
        if (queuedMessage.text === "first") await queueGate.promise;
        return { lines: [`done:${queuedMessage.text}`] };
      },
      send: async (queuedMessage, result) => {
        queueSent.push({ text: queuedMessage.text, lines: result.lines });
      },
    });
    assert.deepEqual(queue.enqueue({ chatId: "1001", messageId: "21", text: "first" }).lines, []);
    await flushMicrotasks();
    assert.deepEqual(queue.enqueue({ chatId: "1001", messageId: "22", text: "second" }).lines, ["Queued: 1 message ahead."]);
    queueGate.resolve();
    await flushMicrotasks();
    assert.deepEqual(queueHandled, ["first", "second"]);
    assert.deepEqual(queueSent, [
      { text: "first", lines: ["done:first"] },
      { text: "second", lines: ["done:second"] },
    ]);

    const defaultRegistry = createDefaultGatewayPlatformRegistry({ fetchImpl: async () => jsonResponse({ ok: true, result: [] }) });
    assert.equal(defaultRegistry.has("telegram"), true);

    const platformRegistry = new GatewayPlatformRegistry();
    platformRegistry.register("telegram", () => ({
      async start({ handleMessage }) {
        await handleMessage({ platform: "telegram", chatId: "1001", userId: "42", messageId: "31", text: "/mode" });
        await flushMicrotasks();
      },
      async send() {},
      async sendBinary() {},
    }));
    const stdout = createWritableCapture();
    const stderr = createWritableCapture();
    const statusCode = await runGatewayCommand({ command: { name: "gateway", args: ["status"] } }, {
      config: { gateway: { enabled: true, defaultWorkspace: "main", workspaces: { main: "." }, platforms: { telegram: { enabled: true } } } },
      cwd,
      stdout,
      stderr,
      platformRegistry,
    });
    assert.equal(statusCode, 0);
    assert.match(stdout.text, /Gateway: enabled/);
    assert.match(stdout.text, /Implemented platforms: telegram/);
    assert.equal(stderr.text, "");

    const fakeRunner = createFakeSwitchingRunner();
    const bridge = createGatewayRunnerBridge({ runner: fakeRunner, cwd });
    const sessionA = { key: "telegram:chat:1", workspaceAlias: "main", workspaceRoot: cwd };
    const sessionB = { key: "telegram:chat:2", workspaceAlias: "main", workspaceRoot: cwd };
    const runnerA = await bridge.getRunner(sessionA);
    assert.equal(sessionA.piSessionFile, "session-1.jsonl");
    await bridge.getRunner(sessionB);
    assert.equal(sessionB.piSessionFile, "session-2.jsonl");
    await bridge.getRunner(sessionA);
    assert.deepEqual(fakeRunner.switches, ["session-1.jsonl"]);
    await runnerA.startNewSession();
    assert.equal(sessionA.piSessionFile, "session-3.jsonl");

    const setupOutput = createWritableCapture();
    const setupCode = await runGatewaySetupCommand({
      cwd,
      output: setupOutput,
      select: async ({ items }) => items[0].value,
      readSecret: async () => "123:token",
      readText: async ({ prompt }) => prompt.includes("user") ? "42" : "current",
    });
    assert.equal(setupCode, 0);
    assert.ok(setupOutput.text.includes("march gateway run"));
    const setupConfig = JSON.parse(readFileSync(join(cwd, ".march", "config.json"), "utf8"));
    assert.equal(setupConfig.gateway.enabled, true);
    assert.equal(setupConfig.gateway.defaultWorkspace, "current");
    assert.equal(setupConfig.gateway.platforms.telegram.botTokenEnv, "TELEGRAM_BOT_TOKEN");
    assert.deepEqual(setupConfig.gateway.platforms.telegram.allowedUsers, ["42"]);
    assert.match(readFileSync(join(cwd, ".env"), "utf8"), /TELEGRAM_BOT_TOKEN=123:token/);
    upsertEnvFile({ path: join(cwd, ".env"), key: "TELEGRAM_BOT_TOKEN", value: "456:next" });
    assert.match(readFileSync(join(cwd, ".env"), "utf8"), /TELEGRAM_BOT_TOKEN=456:next/);
    assert.ok(existsSync(join(cwd, ".march", "config.json")));

    const runCode = await runGatewayCommand({ command: { name: "gateway", args: ["run", "telegram"] } }, {
      config: { gateway: { defaultWorkspace: "main", workspaces: { main: "." }, platforms: { telegram: { enabled: true } } } },
      cwd,
      stdout: createWritableCapture(),
      stderr: createWritableCapture(),
      platformRegistry,
      getRunner: async () => ({}),
    });
    assert.equal(runCode, 0);
  } finally {
    cleanup(cwd);
  }
  console.log("  PASS");
}

function jsonResponse(data, { status = 200 } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    async json() { return data; },
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
}

function createFakeSwitchingRunner() {
  let current = { sessionId: "session-1", sessionFile: "session-1.jsonl" };
  let next = 2;
  return {
    switches: [],
    getSessionStats() { return current; },
    async startNewSession() {
      current = { sessionId: `session-${next}`, sessionFile: `session-${next}.jsonl` };
      next += 1;
      return current;
    },
    async switchPiSession(sessionFile) {
      this.switches.push(sessionFile);
      current = { sessionId: sessionFile.replace(/\.jsonl$/, ""), sessionFile };
      return current;
    },
  };
}

function createWritableCapture() {
  return {
    text: "",
    write(chunk) { this.text += String(chunk); },
  };
}
