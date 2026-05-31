import { capabilities, executePowerPointJs } from "./executor.js";
import { getCurrentSlideScene } from "./scene.js";
import { readPowerPointSelection } from "./selection.js";

const DAEMON_WS = "ws://127.0.0.1:4330/addin";
const MIN_RECONNECT_MS = 500;
const MAX_RECONNECT_MS = 8000;
const statusEl = document.getElementById("status");
const hostEl = document.getElementById("host");
let socket = null;
let generation = 0;
let reconnectAttempt = 0;
let reconnectTimer = null;
let officeInfo = { host: "unknown", platform: "unknown" };

Office.onReady((info) => {
  officeInfo = { host: info.host, platform: info.platform };
  hostEl.textContent = `${info.host ?? "unknown"} ${info.platform ?? ""}`.trim();
  connect();
});

// Owns the add-in side of bridge liveness. Office operations stay in dispatch;
// connection state, retry cadence, and heartbeat replies stay here.
function connect() {
  clearReconnect();
  const current = ++generation;
  setStatus("connecting");

  const nextSocket = new WebSocket(DAEMON_WS);
  socket = nextSocket;

  nextSocket.onopen = () => {
    if (!isCurrent(current, nextSocket)) return;
    reconnectAttempt = 0;
    setStatus("connected");
    send({ type: "hello", info: officeInfo });
  };
  nextSocket.onmessage = (event) => {
    if (!isCurrent(current, nextSocket)) return;
    handleMessage(event.data);
  };
  nextSocket.onclose = () => {
    if (!isCurrent(current, nextSocket)) return;
    setStatus("reconnecting");
    scheduleReconnect();
  };
  nextSocket.onerror = () => {
    if (isCurrent(current, nextSocket)) closeSocket(nextSocket);
  };
}

async function handleMessage(data) {
  let request;
  try { request = JSON.parse(data); } catch { return; }
  if (request.type === "ping") {
    send({ type: "pong", ts: Date.now(), echo: request.ts });
    return;
  }
  if (!request.id) return;
  try {
    const result = await dispatch(request.method, request.params ?? {});
    send({ id: request.id, ok: true, result });
  } catch (err) {
    send({ id: request.id, ok: false, error: serializeError(err) });
  }
}

function dispatch(method, params) {
  if (method === "status") return { ok: true, addin: officeInfo, capabilities: capabilities(), bridge: { status: statusEl.textContent } };
  if (method === "powerpoint.observe") return observePowerPoint(params);
  if (method === "powerpoint.js") return executePowerPointJs(params);
  throw new Error(`Unknown Office method: ${method}`);
}

async function observePowerPoint({ scope = "slide" } = {}) {
  const selection = await readPowerPointSelection({ office: Office, powerpoint: PowerPoint }).catch((err) => ({ status: "error", message: err.message }));
  const slideScene = scope === "selection" ? null : await getCurrentSlideScene().catch((err) => ({ error: err.message }));
  return {
    host: officeInfo,
    scope,
    selection,
    slide: slideScene,
  };
}

function scheduleReconnect() {
  clearReconnect();
  const baseDelay = Math.min(MAX_RECONNECT_MS, MIN_RECONNECT_MS * 2 ** reconnectAttempt++);
  const jitter = Math.floor(Math.random() * Math.min(500, baseDelay));
  reconnectTimer = setTimeout(connect, baseDelay + jitter);
}

function clearReconnect() {
  if (!reconnectTimer) return;
  clearTimeout(reconnectTimer);
  reconnectTimer = null;
}

function send(payload) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
}

function closeSocket(target) {
  try { target.close(); } catch {}
}

function isCurrent(current, target) {
  return generation === current && socket === target;
}

function setStatus(value) {
  statusEl.textContent = value;
  statusEl.className = `status ${value}`;
}

function serializeError(err) {
  return { message: err?.message ?? String(err), stack: err?.stack, logs: err?.logs };
}
