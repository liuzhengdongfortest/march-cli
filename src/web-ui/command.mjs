import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createWebUiServer } from "./server.mjs";
import { createWebSessionManager, resolveWorkspace } from "./session-manager.mjs";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 4174;

export async function runWebUiCommand(args, { config, cwd, stateRoot, useRuntimeProcess = true } = {}) {
  const host = args.host ?? DEFAULT_HOST;
  assertLoopbackHost(host);
  const port = Number.parseInt(args.port ?? "", 10) || DEFAULT_PORT;
  const runtime = createWebSessionManager({ args, config, launchCwd: cwd, stateRoot, useRuntimeProcess });
  const initialWorkspace = resolveInitialWorkspace(args, cwd);
  if (initialWorkspace) await runtime.createSession(initialWorkspace);

  if (args.dev) return runWebUiDevCommand({ args, host, port, runtime, initialWorkspace });
  assertWebBuildReady();
  const server = createWebUiServer({ runtime });
  await listen(server, port, host);
  process.stdout.write(`March Web running at http://${host}:${port}\n`);
  if (initialWorkspace) process.stdout.write(`Workspace: ${initialWorkspace}\n`);
  await waitForShutdown({ servers: [server], runtime });
  return 0;
}

export function resolveInitialWorkspace(args, launchCwd) {
  const positional = args.command?.args ?? [];
  if (positional.length > 1) throw new Error("Usage: march web [workspace] [--host <host>] [--port <port>]");
  if (args.workspace && positional.length > 0) throw new Error("Use either march web <workspace> or --workspace <path>, not both");
  const requested = args.workspace ?? positional[0];
  return requested ? resolveWorkspace(requested, launchCwd) : null;
}

function assertLoopbackHost(host) {
  if (["127.0.0.1", "localhost", "::1"].includes(host)) return;
  throw new Error("march web only exposes local filesystem APIs on 127.0.0.1/localhost");
}

function assertWebBuildReady() {
  if (existsSync(new URL("./dist/index.html", import.meta.url))) return;
  throw new Error("Web UI build not found. Run: npm run web:build or use march web --dev");
}

async function runWebUiDevCommand({ args, host, port, runtime, initialWorkspace }) {
  const apiPort = Number.parseInt(args.apiPort ?? "", 10) || port + 1;
  const apiServer = createWebUiServer({ runtime });
  let apiStarted = false;
  try {
    await listen(apiServer, apiPort, host);
    apiStarted = true;
    const vite = await createViteDevServer({ host, port, apiPort });
    process.stdout.write(`March Web dev running at http://${host}:${port}\n`);
    process.stdout.write(`March Web API running at http://${host}:${apiPort}\n`);
    if (initialWorkspace) process.stdout.write(`Workspace: ${initialWorkspace}\n`);
    await waitForShutdown({ servers: [apiServer], runtime, vite });
    return 0;
  } catch (err) {
    if (apiStarted) await closeServer(apiServer);
    await runtime.dispose?.();
    throw err;
  }
}

async function createViteDevServer({ host, port, apiPort }) {
  let createServer;
  try {
    ({ createServer } = await import("vite"));
  } catch {
    throw new Error("Vite is required for march web --dev. Run npm install in the March repo.");
  }
  const vite = await createServer({
    configFile: fileURLToPath(new URL("./vite.config.mjs", import.meta.url)),
    server: {
      host,
      port,
      strictPort: true,
      proxy: { "/api": `http://${host}:${apiPort}` },
    },
  });
  await vite.listen();
  return vite;
}

function listen(server, port, host) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });
}

function closeServer(server) {
  return new Promise((resolve) => server.close(resolve));
}

function waitForShutdown({ servers, runtime, vite = null }) {
  return new Promise((resolve) => {
    const shutdown = async () => {
      process.off("SIGINT", shutdown);
      process.off("SIGTERM", shutdown);
      if (vite) await vite.close();
      await Promise.all(servers.map(closeServer));
      await runtime.dispose?.();
      resolve();
    };
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
  });
}
