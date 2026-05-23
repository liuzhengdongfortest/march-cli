import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const STATIC_ROOT = fileURLToPath(new URL("./static/", import.meta.url));
const DEFAULT_PORT = 4174;

const rootPrefix = (root) => `${normalize(root).replace(/[\\/]$/, "")}${sep}`;

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".svg", "image/svg+xml"],
]);

export function createWebUiServer({ root = STATIC_ROOT } = {}) {
  return createServer((req, res) => {
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

    res.writeHead(200, { "content-type": mimeTypes.get(extname(filePath)) ?? "application/octet-stream" });
    createReadStream(filePath).pipe(res);
  });
}

export function resolveStaticPath(root, requestUrl) {
  const url = new URL(requestUrl, "http://localhost");
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const decoded = decodeURIComponent(pathname);
  const candidate = normalize(join(root, decoded));
  return candidate.startsWith(rootPrefix(root)) ? candidate : null;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number.parseInt(process.env.MARCH_WEB_PORT ?? "", 10) || DEFAULT_PORT;
  createWebUiServer().listen(port, "127.0.0.1", () => {
    console.log(`March Web prototype running at http://127.0.0.1:${port}`);
  });
}
