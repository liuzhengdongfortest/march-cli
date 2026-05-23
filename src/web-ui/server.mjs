import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const STATIC_ROOT = fileURLToPath(new URL("./dist/", import.meta.url));
const DEFAULT_PORT = 4174;

const rootPrefix = (root) => `${normalize(root).replace(/[\\/]$/, "")}${sep}`;

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".svg", "image/svg+xml"],
]);

export function createWebUiServer({ root = STATIC_ROOT, runtime = null } = {}) {
  return createServer(async (req, res) => {
    if (runtime && req.url?.startsWith("/api/")) {
      await handleApiRequest(req, res, runtime);
      return;
    }
    serveStaticRequest(req, res, root);
  });
}

export async function handleApiRequest(req, res, runtime) {
  const { pathname } = new URL(req.url ?? "/", "http://localhost");
  try {
    if (req.method === "GET" && pathname === "/api/snapshot") return sendJson(res, runtime.snapshot(getSessionId(req)));
    if (req.method === "GET" && pathname === "/api/events") return streamRuntimeEvents(req, res, runtime);
    if (req.method === "GET" && pathname === "/api/sessions") return sendJson(res, { sessions: runtime.listSessions() });
    if (req.method === "POST" && pathname === "/api/sessions") return sendJson(res, await createRuntimeSession(req, runtime));
    if (req.method === "GET" && pathname === "/api/fs/roots") return sendJson(res, { roots: runtime.fsRoots() });
    if (req.method === "GET" && pathname === "/api/fs/list") return sendJson(res, { entries: runtime.fsList(getPathParam(req)) });
    if (req.method === "POST" && pathname === "/api/turn") return sendJson(res, await runRuntimeTurn(req, runtime));
    if (req.method === "POST" && pathname === "/api/abort") return sendJson(res, { ok: true, result: runtime.abort(getSessionId(req)) });
    sendJson(res, { error: "Not found" }, 404);
  } catch (err) {
    sendJson(res, { error: err?.message ?? String(err) }, 500);
  }
}

export function resolveStaticPath(root, requestUrl) {
  const url = new URL(requestUrl, "http://localhost");
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const decoded = decodeURIComponent(pathname);
  const candidate = normalize(join(root, decoded));
  return candidate.startsWith(rootPrefix(root)) ? candidate : null;
}

function serveStaticRequest(req, res, root) {
  const filePath = resolveStaticPath(root, req.url ?? "/");
  if (!filePath) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const type = mimeTypes.get(extname(filePath)) ?? "application/octet-stream";
  res.writeHead(200, { "content-type": type });
  createReadStream(filePath).pipe(res);
}

async function createRuntimeSession(req, runtime) {
  const body = await readJsonBody(req);
  const session = await runtime.createSession(body.workspacePath);
  return { ok: true, session, snapshot: runtime.snapshot(session.id) };
}

async function runRuntimeTurn(req, runtime) {
  const body = await readJsonBody(req);
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) throw new Error("Missing prompt");
  const result = await runtime.runTurn(body.sessionId, prompt);
  return { ok: true, draft: result?.draft ?? "" };
}

function streamRuntimeEvents(req, res, runtime) {
  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
  });
  writeSse(res, "ready", { ok: true });
  const unsubscribe = runtime.subscribe(getSessionId(req), (event) => writeSse(res, "runtime", event));
  res.on("close", unsubscribe);
}

function getSessionId(req) {
  const url = new URL(req.url ?? "/", "http://localhost");
  return url.searchParams.get("sessionId");
}

function getPathParam(req) {
  const url = new URL(req.url ?? "/", "http://localhost");
  const path = url.searchParams.get("path");
  if (!path) throw new Error("Missing path");
  return path;
}

function writeSse(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function sendJson(res, data, status = 200) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) reject(new Error("Request body too large"));
    });
    req.on("end", () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error("Invalid JSON body")); }
    });
    req.on("error", reject);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number.parseInt(process.env.MARCH_WEB_PORT ?? "", 10) || DEFAULT_PORT;
  createWebUiServer().listen(port, "127.0.0.1", () => {
    console.log(`March Web preview running at http://127.0.0.1:${port}`);
  });
}
