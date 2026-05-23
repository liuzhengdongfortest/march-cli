import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { createWebUiServer } from "./server.mjs";
import { createWebRuntimeHost } from "./runtime-host.mjs";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 4174;

export async function runWebUiCommand(args, { config, cwd, stateRoot, useRuntimeProcess = true } = {}) {
  const host = args.host ?? DEFAULT_HOST;
  const port = Number.parseInt(args.port ?? "", 10) || DEFAULT_PORT;
  assertWebBuildReady();
  const workspace = resolveWebWorkspace(args, cwd);
  const runtime = await createWebRuntimeHost({ args, config, cwd: workspace, stateRoot, useRuntimeProcess });
  const server = createWebUiServer({ runtime });
  await listen(server, port, host);
  process.stdout.write(`March Web running at http://${host}:${port}\n`);
  process.stdout.write(`Workspace: ${workspace}\n`);
  await waitForShutdown({ server, runtime });
  return 0;
}

export function resolveWebWorkspace(args, launchCwd) {
  const positional = args.command?.args ?? [];
  if (positional.length > 1) throw new Error("Usage: march web <workspace> [--host <host>] [--port <port>]");
  if (args.workspace && positional.length > 0) throw new Error("Use either march web <workspace> or --workspace <path>, not both");
  const requested = args.workspace ?? positional[0];
  if (!requested) throw new Error("Choose a workspace: march web <path> or march web --workspace <path>");
  const workspace = resolve(launchCwd, requested);
  if (!isDirectory(workspace)) throw new Error(`Workspace does not exist or is not a directory: ${workspace}`);
  return workspace;
}

function isDirectory(path) {
  try { return statSync(path).isDirectory(); } catch { return false; }
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
