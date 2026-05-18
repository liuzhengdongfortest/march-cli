import { strict as assert } from "node:assert";
import { EventEmitter } from "node:events";

export async function runRuntimeRunnerIpcSmoke() {
  console.log("--- smoke: runtime runner IPC ---");
  const { createRuntimeIpcPeer } = await import("../src/agent/runtime/ipc/ipc-peer.mjs");
  const { createRunnerIpcTarget } = await import("../src/agent/runtime/runner-ipc-target.mjs");
  const { createRemoteRunnerClient } = await import("../src/agent/runtime/remote-runner-client.mjs");
  const { createRunnerProcessClient } = await import("../src/agent/runtime/runner-process-client.mjs");

  const link = createMemoryLink();
  const calls = [];
  const target = createRunnerIpcTarget({
    createRunnerImpl: async (options) => createFakeRunner({ calls, options }),
  });
  const host = createRuntimeIpcPeer({ send: link.sendA, subscribe: link.subscribeA, target });
  const remote = createRemoteRunnerClient(createRuntimeIpcPeer({ send: link.sendB, subscribe: link.subscribeB }));

  await remote.init({ cwd: "D:/repo" });
  assert.equal(remote.engine.modelId, "model-a");
  assert.deepEqual(remote.getScopedModels(), [{ model: { id: "model-a" } }]);
  assert.equal(remote.canSwitchPiSession(), true);
  assert.deepEqual(remote.getLspStatus(), { ready: true });
  assert.deepEqual(calls, [["create", "D:/repo"]]);
  assert.deepEqual(await remote.runTurn("prompt", "hello", { currentProject: "repo" }), { draft: "ok:hello" });
  assert.equal(remote.engine.sessionName, "after-turn");
  assert.equal(await remote.setSessionName("named"), "named");
  assert.equal(remote.engine.sessionName, "named");
  assert.equal(await remote.cycleThinkingLevel(), "high");
  assert.equal(remote.engine.thinkingLevel, "high");
  await remote.dispose();
  host.dispose();
  assert.equal(calls.at(-1)[0], "dispose");

  const processLink = createProcessPair();
  const processHost = createRuntimeIpcPeer({
    send: processLink.child.send.bind(processLink.child),
    subscribe: (listener) => {
      processLink.child.on("message", listener);
      return () => processLink.child.off("message", listener);
    },
    target: createRunnerIpcTarget({ createRunnerImpl: async (options) => createFakeRunner({ calls: [], options }) }),
  });
  const payloadEvents = [];
  const uiStatusCalls = [];
  const { runner, dispose } = await createRunnerProcessClient({
    runnerOptions: { cwd: "D:/child" },
    ui: { status: (text) => uiStatusCalls.push(text) },
    onModelPayload: (event) => payloadEvents.push(event),
    forkImpl: () => processLink.parent,
  });
  assert.equal(runner.engine.modelId, "model-a");
  assert.deepEqual(await runner.runTurn("prompt", "child"), { draft: "ok:child" });
  processLink.child.send({ channel: "march-runtime", kind: "notify", method: "modelPayload", args: [{ estimatedTokens: 1234 }] });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(payloadEvents, [{ estimatedTokens: 1234 }]);
  assert.deepEqual(uiStatusCalls, []);
  await dispose();
  processHost.dispose();
  assert.equal(processLink.parent.killed, true);
  console.log("  PASS");
}

function createFakeRunner({ calls, options }) {
  calls.push(["create", options.cwd]);
  const engine = {
    modelId: "model-a",
    provider: "test",
    thinkingLevel: "medium",
    sessionName: "initial",
    turns: [],
  };
  return {
    engine,
    async runTurn(prompt, userMessage) {
      calls.push(["turn", prompt, userMessage]);
      engine.sessionName = "after-turn";
      return { draft: `ok:${userMessage}` };
    },
    abort: () => ({ aborted: true }),
    cycleModel: async () => ({ id: "model-b" }),
    setModel: async (model) => model,
    getCurrentModel: () => ({ id: engine.modelId }),
    getScopedModels: () => [{ model: { id: "model-a" } }],
    getConfiguredProviders: () => ["test"],
    getSessionStats: () => ({ sessionId: "session-a" }),
    getLastNotificationResult: () => null,
    notifyTest: async () => ({ ok: true }),
    estimateContextTokens: () => 3,
    setSessionName(name) {
      engine.sessionName = name;
      return name;
    },
    canSwitchPiSession: () => true,
    startNewSession: async () => ({ sessionId: "new" }),
    getExtensionDiagnostics: () => [],
    getExtensionLifecycleState: () => ({ running: false }),
    getLspStatus: () => ({ ready: true }),
    switchPiSession: async (sessionPath) => ({ sessionPath }),
    cycleThinkingLevel() {
      engine.thinkingLevel = "high";
      return engine.thinkingLevel;
    },
    getThinkingLevel: () => engine.thinkingLevel,
    setThinkingLevel(level) {
      engine.thinkingLevel = level;
      return level;
    },
    getAvailableThinkingLevels: () => ["medium", "high"],
    dispose: async () => calls.push(["dispose"]),
  };
}

function createMemoryLink() {
  const a = new EventEmitter();
  const b = new EventEmitter();
  return {
    sendA: (message) => queueMicrotask(() => b.emit("message", message)),
    sendB: (message) => queueMicrotask(() => a.emit("message", message)),
    subscribeA: (listener) => {
      a.on("message", listener);
      return () => a.off("message", listener);
    },
    subscribeB: (listener) => {
      b.on("message", listener);
      return () => b.off("message", listener);
    },
  };
}

function createProcessPair() {
  const parent = new EventEmitter();
  const child = new EventEmitter();
  parent.send = (message) => queueMicrotask(() => child.emit("message", message));
  child.send = (message) => queueMicrotask(() => parent.emit("message", message));
  parent.kill = () => { parent.killed = true; };
  return { parent, child };
}
