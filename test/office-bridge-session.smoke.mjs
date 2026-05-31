import { strict as assert } from "node:assert";
import { EventEmitter } from "node:events";
import WebSocket from "ws";
import { createAddinBridge } from "../src/office/daemon/bridge-session.mjs";

export async function runOfficeBridgeSessionSmoke() {
  console.log("--- smoke: office bridge session manager ---");

  const bridge = createAddinBridge({ heartbeatIntervalMs: 0, now: () => 1000 });
  const socket = new FakeSocket();
  bridge.attach(socket);

  assert.equal(bridge.status().lifecycle, "handshaking");
  await assert.rejects(() => bridge.request("status", {}, 10), /not ready/);

  socket.emit("message", JSON.stringify({ type: "hello", info: { host: "PowerPoint", platform: "PC" } }));
  assert.equal(bridge.isConnected(), true);
  assert.equal(bridge.status().connected, true);

  const pending = bridge.request("powerpoint.observe", { scope: "slide" }, 1000);
  const request = JSON.parse(socket.sent.at(-1));
  assert.equal(request.method, "powerpoint.observe");
  socket.emit("message", JSON.stringify({ id: request.id, ok: true, result: { ok: true } }));
  assert.deepEqual(await pending, { ok: true });

  const disconnecting = bridge.request("powerpoint.observe", {}, 1000);
  socket.emit("close");
  await assert.rejects(disconnecting, /disconnected/);
  assert.equal(bridge.status().lifecycle, "disconnected");

  console.log("  PASS");
}

class FakeSocket extends EventEmitter {
  readyState = WebSocket.OPEN;
  sent = [];

  send(data, callback) {
    this.sent.push(String(data));
    callback?.();
  }

  close() {
    this.readyState = WebSocket.CLOSED;
    this.emit("close");
  }
}
