import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { ensureBrowserDaemon, stopBrowserDaemon } from "../client/lifecycle.mjs";
import { readBrowserDaemonState } from "../client/state.mjs";
import { requestBrowserDaemon } from "../client/http.mjs";
import { openBrowserUrl } from "./open-url.mjs";

export async function runBrowserCommand(args, { stateRoot } = {}) {
  const subcommand = args.command.args[0] ?? "status";
  if (subcommand === "install") return await installBrowser({ stateRoot });
  if (subcommand === "status") return await printStatus({ stateRoot });
  if (subcommand === "restart") return await restartBrowserDaemon({ stateRoot });
  if (subcommand === "daemon" && args.foreground) return await runForegroundDaemon({ stateRoot });
  process.stderr.write("Usage: march browser install|status|restart\n");
  return 1;
}

async function installBrowser({ stateRoot }) {
  const state = await ensureBrowserDaemon({ stateRoot });
  await openBrowserUrl("chrome://extensions");
  const extensionPath = browserExtensionPath();
  process.stdout.write(`March Browser developer install\n\n`);
  process.stdout.write(`1. Chrome extensions page opened: chrome://extensions\n`);
  process.stdout.write(`2. Enable Developer mode.\n`);
  process.stdout.write(`3. Click Load unpacked.\n`);
  process.stdout.write(`4. Select this folder:\n   ${extensionPath}\n`);
  process.stdout.write(`5. If the extension is already loaded, click its Reload button.\n\n`);
  process.stdout.write(`Daemon: ${state.url}\n`);
  process.stdout.write(`Extension WebSocket: ${state.wsUrl}\n`);
  return await printStatus({ stateRoot });
}

async function printStatus({ stateRoot }) {
  const state = readBrowserDaemonState(stateRoot);
  try {
    const status = await requestBrowserDaemon(state.url, "/status", null, { timeoutMs: 800 });
    process.stdout.write(`Browser daemon: running pid=${status.pid}\n`);
    process.stdout.write(`Browser extension: ${status.extensionConnected ? "connected" : "not connected"}\n`);
    process.stdout.write(`Extension path: ${browserExtensionPath()}\n`);
    return 0;
  } catch {
    process.stdout.write("Browser daemon: not running\n");
    process.stdout.write(`Extension path: ${browserExtensionPath()}\n`);
    return 0;
  }
}

async function restartBrowserDaemon({ stateRoot }) {
  await stopBrowserDaemon({ stateRoot });
  await ensureBrowserDaemon({ stateRoot });
  return await printStatus({ stateRoot });
}

async function runForegroundDaemon({ stateRoot }) {
  const { createBrowserDaemonServer } = await import("../daemon/server.mjs");
  const server = createBrowserDaemonServer({ stateRoot });
  await server.start();
  process.stdout.write(`Browser daemon foreground: ${readBrowserDaemonState(stateRoot).url}\n`);
  return new Promise(() => {});
}

function browserExtensionPath() {
  const path = resolve(dirname(fileURLToPath(import.meta.url)), "../extension");
  if (!existsSync(path)) throw new Error(`Browser extension not found: ${path}`);
  return path;
}
