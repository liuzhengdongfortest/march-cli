import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { openMarkdownRoot, searchMarkdownRoot } from "../search.mjs";

const MAX_BODY_BYTES = 64 * 1024;

export function createRemoteMemoryServer({ root, name = "remote-memory", token = null } = {}) {
  if (!root) throw new Error("remote memory server requires a folder");
  const resolvedRoot = resolve(root);
  const authToken = token || createMemoryServerToken();

  const server = createServer(async (req, res) => {
    try {
      if (!isAuthorized(req, authToken)) return sendJson(res, 401, { error: "unauthorized" });
      const url = new URL(req.url, "http://127.0.0.1");
      if (req.method === "GET" && url.pathname === "/metadata") {
        return sendJson(res, 200, { name, rootLabel: resolvedRoot, capabilities: ["search", "open"], version: 1 });
      }
      if (req.method === "POST" && url.pathname === "/search") {
        const body = await readJsonBody(req);
        const results = searchMarkdownRoot({
          root: resolvedRoot,
          query: body.query ?? body.pattern,
          limit: body.limit,
          context: body.context,
          syntax: body.syntax,
          caseMode: body.case,
          glob: body.glob,
        });
        return sendJson(res, 200, { results });
      }
      if (req.method === "POST" && url.pathname === "/open") {
        const body = await readJsonBody(req);
        const opened = openMarkdownRoot({
          root: resolvedRoot,
          path: body.path,
          line: body.line,
          context: body.context,
          offset: body.offset,
          limit: body.limit,
        });
        return sendJson(res, 200, {
          path: opened.relativePath,
          startLine: opened.startLine,
          endLine: opened.endLine,
          content: opened.content,
          readonly: true,
        });
      }
      return sendJson(res, 404, { error: "not found" });
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
  });

  return { server, token: authToken, root: resolvedRoot, name };
}

export function createMemoryServerToken() {
  return `mem_${randomBytes(18).toString("base64url")}`;
}

function isAuthorized(req, token) {
  if (!token) return true;
  const header = req.headers.authorization ?? "";
  return header === `Bearer ${token}`;
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  res.end(`${JSON.stringify(data)}\n`);
}

function readJsonBody(req) {
  return new Promise((resolveBody, reject) => {
    let size = 0;
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      size += Buffer.byteLength(chunk);
      if (size > MAX_BODY_BYTES) {
        reject(new Error("request body too large"));
        req.destroy();
        return;
      }
      body += chunk;
    });
    req.on("error", reject);
    req.on("end", () => {
      if (!body.trim()) return resolveBody({});
      try {
        resolveBody(JSON.parse(body));
      } catch {
        reject(new Error("invalid JSON body"));
      }
    });
  });
}
