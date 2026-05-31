import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { OFFICE_DAEMON_HOST, OFFICE_DAEMON_PORT } from "./constants.mjs";
import { createAddinBridge } from "./bridge-session.mjs";
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

async function handleHttp(req, res, bridge, shutdown) {
  try {
    const path = new URL(req.url, "http://localhost").pathname;
    if (req.method === "GET" && isAddinAssetPath(path)) return await sendAddinAsset(res, path);
    if (req.method === "GET" && path === "/status") {
      const bridgeStatus = bridge.status();
      return sendJson(res, 200, {
        ok: true,
        pid: process.pid,
        addinConnected: bridgeStatus.connected,
        addin: bridgeStatus.addin,
        bridge: bridgeStatus,
      });
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
  return ["/", "/taskpane.html", "/taskpane.js", "/executor.js", "/scene.js", "/taskpane.css", "/manifest.xml", "/icon-16.png", "/icon-32.png", "/icon-64.png", "/icon-80.png"].includes(path);
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
