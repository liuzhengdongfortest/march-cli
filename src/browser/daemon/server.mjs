import { createServer } from "node:http";
import WebSocket, { WebSocketServer } from "ws";
import { BROWSER_DAEMON_HOST, BROWSER_DAEMON_PORT } from "./constants.mjs";
import { writeBrowserDaemonState } from "../client/state.mjs";

export function createBrowserDaemonServer({ stateRoot, port = BROWSER_DAEMON_PORT } = {}) {
  const bridge = createExtensionBridge();
  const server = createServer((req, res) => handleHttp(req, res, bridge, () => shutdown()));
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    if (new URL(req.url, "http://localhost").pathname !== "/extension") {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => bridge.attach(ws));
  });

  async function start() {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, BROWSER_DAEMON_HOST, resolve);
    });
    const address = server.address();
    const actualPort = typeof address === "object" ? address.port : port;
    writeBrowserDaemonState(stateRoot, {
      pid: process.pid,
      url: `http://${BROWSER_DAEMON_HOST}:${actualPort}`,
      wsUrl: `ws://${BROWSER_DAEMON_HOST}:${actualPort}/extension`,
      startedAt: Date.now(),
    });
  }

  async function shutdown() {
    bridge.close();
    wss.close();
    await new Promise((resolve) => server.close(resolve));
  }

  return { start, shutdown, bridge };
}

function createExtensionBridge() {
  let socket = null;
  const pending = new Map();

  function attach(ws) {
    if (socket && socket.readyState === WebSocket.OPEN) socket.close();
    socket = ws;
    ws.on("message", (data) => handleExtensionMessage(data));
    ws.on("close", () => {
      if (socket === ws) socket = null;
    });
  }

  async function request(method, params = {}, timeoutMs = 30000) {
    if (!socket || socket.readyState !== WebSocket.OPEN) throw new Error("Browser extension is not connected. Run: march browser install");
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    const message = JSON.stringify({ id, method, params });
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Browser extension request timed out: ${method}`));
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      socket.send(message, (err) => {
        if (!err) return;
        clearTimeout(timer);
        pending.delete(id);
        reject(err);
      });
    });
  }

  function handleExtensionMessage(data) {
    let msg;
    try { msg = JSON.parse(String(data)); } catch { return; }
    const entry = pending.get(msg.id);
    if (!entry) return;
    clearTimeout(entry.timer);
    pending.delete(msg.id);
    msg.ok === false ? entry.reject(new Error(formatExtensionError(msg.error))) : entry.resolve(msg.result);
  }

  function close() {
    for (const [id, entry] of pending) {
      clearTimeout(entry.timer);
      entry.reject(new Error("Browser daemon is shutting down"));
      pending.delete(id);
    }
    socket?.close();
  }

  return { attach, request, close, isConnected: () => Boolean(socket && socket.readyState === WebSocket.OPEN) };
}

async function handleHttp(req, res, bridge, shutdown) {
  try {
    const path = new URL(req.url, "http://localhost").pathname;
    if (req.method === "GET" && path === "/status") {
      return sendJson(res, 200, { ok: true, pid: process.pid, extensionConnected: bridge.isConnected() });
    }
    if (req.method === "POST" && path === "/rpc") {
      const body = await readJson(req);
      const result = await bridge.request(body.method, body.params, body.timeoutMs);
      return sendJson(res, 200, { ok: true, result });
    }
    if (req.method === "POST" && path === "/shutdown") {
      sendJson(res, 200, { ok: true });
      setTimeout(() => shutdown().then(() => process.exit(0)), 10);
      return;
    }
    sendJson(res, 404, { ok: false, error: "Not found" });
  } catch (err) {
    sendJson(res, 500, { ok: false, error: err.message });
  }
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      try { resolve(body ? JSON.parse(body) : {}); } catch (err) { reject(err); }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(payload));
}

export function formatExtensionError(error) {
  if (!error) return "Browser extension request failed";
  if (typeof error === "string") return error;
  if (typeof error.stack === "string" && error.stack) return error.stack;
  if (typeof error.message === "string" && error.message) return error.message;
  if (error.message && typeof error.message === "object") return safeStringify(error.message);
  return safeStringify(error);
}

function safeStringify(value) {
  try { return JSON.stringify(value); } catch { return String(value); }
}
