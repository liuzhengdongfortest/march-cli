import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { readBrowserDaemonState, removeBrowserDaemonState } from "./state.mjs";
import { requestBrowserDaemon } from "./http.mjs";

export async function ensureBrowserDaemon({ stateRoot, quiet = true } = {}) {
  const state = readBrowserDaemonState(stateRoot);
  if (await pingBrowserDaemon(state.url)) return state;

  removeBrowserDaemonState(stateRoot);
  const child = spawn(process.execPath, [daemonEntryPath(), "--state-root", stateRoot], {
    detached: true,
    stdio: quiet ? "ignore" : "inherit",
    windowsHide: true,
  });
  child.once("error", () => {});
  child.unref();

  const deadline = Date.now() + 4000;
  let lastError = null;
  while (Date.now() < deadline) {
    await sleep(120);
    try {
      const next = readBrowserDaemonState(stateRoot);
      if (await pingBrowserDaemon(next.url)) return next;
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(`Browser daemon did not start${lastError ? `: ${lastError.message}` : ""}`);
}

export async function pingBrowserDaemon(url) {
  try {
    const status = await requestBrowserDaemon(url, "/status", null, { timeoutMs: 700 });
    return Boolean(status?.ok);
  } catch {
    return false;
  }
}

export async function stopBrowserDaemon({ stateRoot } = {}) {
  const state = readBrowserDaemonState(stateRoot);
  try {
    await requestBrowserDaemon(state.url, "/shutdown", {}, { timeoutMs: 1500 });
  } catch {}
  removeBrowserDaemonState(stateRoot);
}

function daemonEntryPath() {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../daemon/entry.mjs");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
