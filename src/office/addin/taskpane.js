import { capabilities, executePowerPointJs } from "./executor.js";
import { getCurrentSlideScene } from "./scene.js";

const DAEMON_WS = "ws://127.0.0.1:4330/addin";
const statusEl = document.getElementById("status");
const hostEl = document.getElementById("host");
let socket = null;
let officeInfo = { host: "unknown", platform: "unknown" };

Office.onReady((info) => {
  officeInfo = { host: info.host, platform: info.platform };
  hostEl.textContent = `${info.host ?? "unknown"} ${info.platform ?? ""}`.trim();
  connect();
});

function connect() {
  setStatus("connecting");
  socket = new WebSocket(DAEMON_WS);
  socket.onopen = () => {
    setStatus("connected");
    send({ type: "hello", info: officeInfo });
  };
  socket.onmessage = (event) => handleMessage(event.data);
  socket.onclose = () => {
    setStatus("disconnected");
    setTimeout(connect, 1000);
  };
  socket.onerror = () => socket?.close();
}

async function handleMessage(data) {
  const request = JSON.parse(data);
  if (!request.id) return;
  try {
    const result = await dispatch(request.method, request.params ?? {});
    send({ id: request.id, ok: true, result });
  } catch (err) {
    send({ id: request.id, ok: false, error: serializeError(err) });
  }
}

function dispatch(method, params) {
  if (method === "status") return { ok: true, addin: officeInfo, capabilities: capabilities() };
  if (method === "powerpoint.observe") return observePowerPoint(params);
  if (method === "powerpoint.js") return executePowerPointJs(params);
  throw new Error(`Unknown Office method: ${method}`);
}

async function observePowerPoint({ scope = "slide" } = {}) {
  const selectionText = await getSelectedText().catch((err) => ({ error: err.message }));
  const slideScene = scope === "selection" ? null : await getCurrentSlideScene().catch((err) => ({ error: err.message }));
  return {
    host: officeInfo,
    scope,
    selection: typeof selectionText === "string" ? { text: selectionText } : selectionText,
    slide: slideScene,
  };
}

function getSelectedText() {
  return new Promise((resolve, reject) => {
    Office.context.document.getSelectedDataAsync(Office.CoercionType.Text, (result) => {
      result.status === Office.AsyncResultStatus.Succeeded ? resolve(result.value ?? "") : reject(new Error(result.error?.message || "Cannot read selected text"));
    });
  });
}

function send(payload) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
}

function setStatus(value) {
  statusEl.textContent = value;
  statusEl.className = `status ${value}`;
}

function serializeError(err) {
  return { message: err?.message ?? String(err), stack: err?.stack, logs: err?.logs };
}
