import { homedir } from "node:os";
import { join } from "node:path";
import { requestOfficeDaemon } from "../client/http.mjs";
import { ensureOfficeDaemon, stopOfficeDaemon } from "../client/lifecycle.mjs";
import { readOfficeDaemonState } from "../client/state.mjs";
import { installedOfficeAddinPath, syncOfficeAddinInstall } from "../addin-install.mjs";

export async function runOfficeCommand(args, { stateRoot = join(homedir(), ".march") } = {}) {
  const subcommand = args.command.args[0] ?? "status";
  if (subcommand === "install") return await installOfficeAddin({ stateRoot });
  if (subcommand === "status") return await printStatus({ stateRoot });
  if (subcommand === "restart") return await restartOfficeDaemon({ stateRoot });
  if (subcommand === "daemon" && args.foreground) return await runForegroundDaemon({ stateRoot });
  process.stderr.write("Usage: march office install|status|restart\n");
  return 1;
}

async function installOfficeAddin({ stateRoot }) {
  const addinPath = syncOfficeAddinInstall(stateRoot);
  const state = await ensureOfficeDaemon({ stateRoot });
  process.stdout.write("March Office add-in developer install\n\n");
  process.stdout.write("1. Start PowerPoint.\n");
  process.stdout.write("2. Sideload this manifest as an Office Web Add-in:\n");
  process.stdout.write(`   ${join(addinPath, "manifest.xml")}\n`);
  process.stdout.write("3. Keep March running so the add-in can connect to the local bridge.\n\n");
  process.stdout.write(`Daemon: ${state.url}\n`);
  process.stdout.write(`Add-in WebSocket: ${state.wsUrl}\n`);
  return await printStatus({ stateRoot });
}

async function printStatus({ stateRoot }) {
  const state = readOfficeDaemonState(stateRoot);
  try {
    const status = await requestOfficeDaemon(state.url, "/status", null, { timeoutMs: 800 });
    process.stdout.write(`Office daemon: running pid=${status.pid}\n`);
    process.stdout.write(`Office add-in: ${status.addinConnected ? "connected" : "not connected"}\n`);
    if (status.addin) process.stdout.write(`Office host: ${status.addin.host ?? "unknown"} ${status.addin.platform ?? ""}\n`);
    process.stdout.write(`Add-in path: ${installedOfficeAddinPath(stateRoot)}\n`);
    return 0;
  } catch {
    process.stdout.write("Office daemon: not running\n");
    process.stdout.write(`Add-in path: ${installedOfficeAddinPath(stateRoot)}\n`);
    return 0;
  }
}

async function restartOfficeDaemon({ stateRoot }) {
  await stopOfficeDaemon({ stateRoot });
  await ensureOfficeDaemon({ stateRoot });
  return await printStatus({ stateRoot });
}

async function runForegroundDaemon({ stateRoot }) {
  const { createOfficeDaemonServer } = await import("../daemon/server.mjs");
  const server = createOfficeDaemonServer({ stateRoot });
  await server.start();
  process.stdout.write(`Office daemon foreground: ${readOfficeDaemonState(stateRoot).url}\n`);
  return new Promise(() => {});
}
