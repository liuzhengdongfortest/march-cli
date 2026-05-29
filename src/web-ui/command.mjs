import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createWebUiServer } from "./server.mjs";
import { createWebSessionManager, resolveWorkspace } from "./session-manager.mjs";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 4174;

export async function runWebUiCommand(args, { config, cwd, stateRoot } = {}) {
  const session = await startWebUiSession({ args, config, cwd, stateRoot });
  process.stdout.write(`${session.dev ? "March Web dev" : "March Web"} running at ${session.url}\n`);
  if (session.apiUrl) process.stdout.write(`March Web API running at ${session.apiUrl}\n`);
  if (session.initialWorkspace) process.stdout.write(`Workspace: ${session.initialWorkspace}\n`);
  await waitForShutdown(session);
  return 0;
}

export async function startWebUiSession({ args, config, cwd, stateRoot } = {}) {
  const host = args.host ?? DEFAULT_HOST;
  assertLoopbackHost(host);
  const port = Number.parseInt(args.port ?? "", 10) || DEFAULT_PORT;
  const runtime = createWebSessionManager({ args, config, launchCwd: cwd, stateRoot });
  const initialWorkspace = resolveInitialWorkspace(args, cwd);
  if (initialWorkspace) await runtime.createSession(initialWorkspace);

  if (args.dev) return await startWebUiDevSession({ args, host, port, runtime, initialWorkspace });

  assertWebBuildReady();
  const server = createWebUiServer({ runtime });
  try {
    await listen(server, port, host);
    return {
      dev: false,
      host,
      port,
      url: `http://${host}:${port}`,
      initialWorkspace,
      dispose: () => disposeWebUiSession({ servers: [server], runtime }),
    };
  } catch (err) {
    await runtime.dispose?.();
    throw err;
  }
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
  throw new Error("Web UI build not found. Run: npm run web:build or use --dev");
}

async function startWebUiDevSession({ args, host, port, runtime, initialWorkspace }) {
  const apiPort = Number.parseInt(args.apiPort ?? "", 10) || port + 1;
  const apiServer = createWebUiServer({ runtime });
  let apiStarted = false;
  try {
    await listen(apiServer, apiPort, host);
    apiStarted = true;
    const vite = await createViteDevServer({ host, port, apiPort });
    return {
      dev: true,
      host,
      port,
      apiPort,
      url: `http://${host}:${port}`,
      apiUrl: `http://${host}:${apiPort}`,
      initialWorkspace,
      dispose: () => disposeWebUiSession({ servers: [apiServer], runtime, vite }),
    };
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
    throw new Error("Vite is required for March desktop/web --dev. Run npm install in the March repo.");
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

async function disposeWebUiSession({ servers, runtime, vite = null }) {
  if (vite) await vite.close();
  await Promise.all(servers.map(closeServer));
  await runtime.dispose?.();
}

function waitForShutdown(session) {
  return new Promise((resolve) => {
    const shutdown = async () => {
      process.off("SIGINT", shutdown);
      process.off("SIGTERM", shutdown);
      await session.dispose();
      resolve();
    };
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
  });
}
