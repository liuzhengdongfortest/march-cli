import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket, { WebSocketServer } from "ws";
import { OFFICE_DAEMON_HOST, OFFICE_DAEMON_PORT } from "./constants.mjs";
import { writeOfficeDaemonState } from "../client/state.mjs";

export function createOfficeDaemonServer({ stateRoot, port = OFFICE_DAEMON_PORT } = {}) {
  const bridge = createAddinBridge();
  const server = createServer((req, res) => handleHttp(req, res, bridge, () => shutdown()));
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    if (new URL(req.url, "http://localhost").pathname !== "/addin") {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => bridge.attach(ws));
  });

  async function start() {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, OFFICE_DAEMON_HOST, resolve);
    });
    const address = server.address();
    const actualPort = typeof address === "object" ? address.port : port;
    writeOfficeDaemonState(stateRoot, {
      pid: process.pid,
      url: `http://${OFFICE_DAEMON_HOST}:${actualPort}`,
      wsUrl: `ws://${OFFICE_DAEMON_HOST}:${actualPort}/addin`,
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

function createAddinBridge() {
  let socket = null;
  let info = null;
  const pending = new Map();

  function attach(ws) {
    if (socket && socket.readyState === WebSocket.OPEN) socket.close();
    socket = ws;
    info = null;
    ws.on("message", (data) => handleAddinMessage(data));
    ws.on("close", () => {
      if (socket === ws) {
        socket = null;
        info = null;
      }
    });
  }

  async function request(method, params = {}, timeoutMs = 30000) {
    if (!isConnected()) throw new Error("Office add-in is not connected. Run: march office install");
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    const message = JSON.stringify({ id, method, params });
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Office add-in request timed out: ${method}`));
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

  function handleAddinMessage(data) {
    let msg;
    try { msg = JSON.parse(String(data)); } catch { return; }
    if (msg.type === "hello") {
      info = msg.info ?? null;
      return;
    }
    const entry = pending.get(msg.id);
    if (!entry) return;
    clearTimeout(entry.timer);
    pending.delete(msg.id);
    msg.ok === false ? entry.reject(new Error(formatAddinError(msg.error))) : entry.resolve(msg.result);
  }

  function close() {
    for (const [id, entry] of pending) {
      clearTimeout(entry.timer);
      entry.reject(new Error("Office daemon is shutting down"));
      pending.delete(id);
    }
    socket?.close();
  }

  function isConnected() {
    return Boolean(socket && socket.readyState === WebSocket.OPEN);
  }

  return { attach, request, close, isConnected, info: () => info };
}

async function handleHttp(req, res, bridge, shutdown) {
  try {
    const path = new URL(req.url, "http://localhost").pathname;
    if (req.method === "GET" && isAddinAssetPath(path)) return await sendAddinAsset(res, path);
    if (req.method === "GET" && path === "/status") {
      return sendJson(res, 200, { ok: true, pid: process.pid, addinConnected: bridge.isConnected(), addin: bridge.info() });
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

function isAddinAssetPath(path) {
  return ["/", "/taskpane.html", "/taskpane.js", "/actions.js", "/scene.js", "/taskpane.css", "/manifest.xml", "/icon-16.png", "/icon-32.png", "/icon-64.png", "/icon-80.png"].includes(path);
}

async function sendAddinAsset(res, path) {
  if (path.startsWith("/icon-")) {
    res.writeHead(200, { "content-type": "image/png" });
    res.end(Buffer.from(TRANSPARENT_PNG_BASE64, "base64"));
    return;
  }
  const name = path === "/" ? "taskpane.html" : path.slice(1);
  const content = await readFile(resolve(addinRoot(), name), "utf8");
  res.writeHead(200, { "content-type": contentType(name) });
  res.end(content);
}

function addinRoot() {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../addin");
}

function contentType(name) {
  if (name.endsWith(".html")) return "text/html; charset=utf-8";
  if (name.endsWith(".css")) return "text/css; charset=utf-8";
  if (name.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (name.endsWith(".xml")) return "application/xml; charset=utf-8";
  return "application/octet-stream";
}

const TRANSPARENT_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lQn3ZQAAAABJRU5ErkJggg==";

export function formatAddinError(error) {
  if (!error) return "Office add-in request failed";
  if (typeof error === "string") return error;
  if (typeof error.stack === "string" && error.stack) return error.stack;
  if (typeof error.message === "string" && error.message) return error.message;
  return safeStringify(error);
}

function safeStringify(value) {
  try { return JSON.stringify(value); } catch { return String(value); }
}
