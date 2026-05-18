import { strict as assert } from "node:assert";

export async function runRuntimeIpcSmoke() {
  console.log("--- smoke: runtime IPC peer ---");
  const { EventEmitter } = await import("node:events");
  const { createRuntimeIpcPeer } = await import("../src/agent/runtime/ipc-peer.mjs");
  const { createProcessRuntimeIpcPeer } = await import("../src/agent/runtime/process-ipc-transport.mjs");
  const { createRemoteRuntimeUiClient } = await import("../src/agent/runtime/remote-ui-client.mjs");
  const { createRuntimeUiEventTarget } = await import("../src/agent/runtime/ui-event-bridge.mjs");

  const link = createMemoryLink();
  const calls = [];
  const host = createRuntimeIpcPeer({
    send: link.sendA,
    subscribe: link.subscribeA,
    target: createRuntimeUiEventTarget({
      textDelta: (delta) => calls.push(["text", delta]),
      toolStart: (name, args) => calls.push(["toolStart", name, args]),
      requestPermission: async ({ toolName, params, category }) => ({ behavior: "allow", toolName, params, category }),
    }),
  });
  const runtime = createRuntimeIpcPeer({
    send: link.sendB,
    subscribe: link.subscribeB,
    target: {
      echo: (value) => value,
      fail: () => { throw new Error("boom"); },
    },
  });
  const remoteUi = createRemoteRuntimeUiClient(runtime);

  remoteUi.textDelta("hello");
  remoteUi.toolStart("read", { path: "a" });
  const decision = await remoteUi.requestPermission({ toolName: "edit_file", params: { path: "a" }, category: "write" });

  assert.deepEqual(calls, [
    ["text", "hello"],
    ["toolStart", "read", { path: "a" }],
  ]);
  assert.deepEqual(decision, { behavior: "allow", toolName: "edit_file", params: { path: "a" }, category: "write" });
  assert.equal(await host.call("echo", "ok"), "ok");
  await assert.rejects(() => host.call("fail"), /boom/);

  host.dispose();
  runtime.dispose();

  const parentProcess = createLinkedProcess(EventEmitter);
  const childProcess = createLinkedProcess(EventEmitter);
  parentProcess.peer = childProcess;
  childProcess.peer = parentProcess;
  const parent = createProcessRuntimeIpcPeer({
    processLike: parentProcess,
    target: { parentEcho: (value) => `parent:${value}` },
  });
  const child = createProcessRuntimeIpcPeer({
    processLike: childProcess,
    target: { childEcho: (value) => `child:${value}` },
  });
  assert.equal(await parent.call("childEcho", "ok"), "child:ok");
  assert.equal(await child.call("parentEcho", "ok"), "parent:ok");
  parent.dispose();
  child.dispose();
  console.log("  PASS");
}

function createLinkedProcess(EventEmitter) {
  const bus = new EventEmitter();
  bus.send = (message) => bus.peer.emit("message", message);
  return bus;
}

function createMemoryLink() {
  const a = new Set();
  const b = new Set();
  return {
    sendA: (message) => { for (const listener of [...b]) listener(message); },
    sendB: (message) => { for (const listener of [...a]) listener(message); },
    subscribeA: (listener) => { a.add(listener); return () => a.delete(listener); },
    subscribeB: (listener) => { b.add(listener); return () => b.delete(listener); },
  };
}