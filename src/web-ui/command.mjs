import { existsSync } from "node:fs";
import { createWebUiServer } from "./server.mjs";
import { createWebSessionManager, resolveWorkspace } from "./session-manager.mjs";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 4174;

export async function runWebUiCommand(args, { config, cwd, stateRoot, useRuntimeProcess = true } = {}) {
  const host = args.host ?? DEFAULT_HOST;
  assertLoopbackHost(host);
  const port = Number.parseInt(args.port ?? "", 10) || DEFAULT_PORT;
  assertWebBuildReady();
  const runtime = createWebSessionManager({ args, config, launchCwd: cwd, stateRoot, useRuntimeProcess });
  const initialWorkspace = resolveInitialWorkspace(args, cwd);
  if (initialWorkspace) await runtime.createSession(initialWorkspace);
  const server = createWebUiServer({ runtime });
  await listen(server, port, host);
  process.stdout.write(`March Web running at http://${host}:${port}\n`);
  if (initialWorkspace) process.stdout.write(`Workspace: ${initialWorkspace}\n`);
  await waitForShutdown({ server, runtime });
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
  throw new Error("Web UI build not found. Run: npm run web:build");
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

function waitForShutdown({ server, runtime }) {
  return new Promise((resolve) => {
    const shutdown = async () => {
      process.off("SIGINT", shutdown);
      process.off("SIGTERM", shutdown);
      await new Promise((done) => server.close(done));
      await runtime.dispose?.();
      resolve();
    };
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
  });
}
