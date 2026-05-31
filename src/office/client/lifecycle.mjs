import { spawn } from "node:child_process";
import { mkdirSync, openSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { requestOfficeDaemon } from "./http.mjs";
import { readOfficeDaemonState, removeOfficeDaemonState } from "./state.mjs";

export async function ensureOfficeDaemon({ stateRoot, quiet = true } = {}) {
  const state = readOfficeDaemonState(stateRoot);
  if (await pingOfficeDaemon(state.url)) return state;

  removeOfficeDaemonState(stateRoot);
  const logPath = officeDaemonLogPath(stateRoot);
  const stdio = quiet ? ["ignore", openLogFd(logPath), openLogFd(logPath)] : "inherit";
  const child = spawn(process.execPath, [daemonEntryPath(), "--state-root", stateRoot], {
    detached: true,
    stdio,
    windowsHide: true,
  });
  child.once("error", () => {});
  child.unref();

  const deadline = Date.now() + 4000;
  let lastError = null;
  while (Date.now() < deadline) {
    await sleep(120);
    try {
      const next = readOfficeDaemonState(stateRoot);
      if (await pingOfficeDaemon(next.url)) return next;
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(`Office daemon did not start${lastError ? `: ${lastError.message}` : ""}. Log: ${logPath}`);
}

export async function pingOfficeDaemon(url) {
  try {
    const status = await requestOfficeDaemon(url, "/status", null, { timeoutMs: 700 });
    return Boolean(status?.ok);
  } catch {
    return false;
  }
}

export async function stopOfficeDaemon({ stateRoot } = {}) {
  const state = readOfficeDaemonState(stateRoot);
  try {
    await requestOfficeDaemon(state.url, "/shutdown", {}, { timeoutMs: 1500 });
  } catch {}
  await waitForOfficeDaemonStopped(state.url);
  removeOfficeDaemonState(stateRoot);
}

async function waitForOfficeDaemonStopped(url) {
  const deadline = Date.now() + 2500;
  while (Date.now() < deadline) {
    if (!await pingOfficeDaemon(url)) return;
    await sleep(100);
  }
}

function daemonEntryPath() {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../daemon/entry.mjs");
}

function officeDaemonLogPath(stateRoot) {
  return join(stateRoot, "office-daemon.log");
}

function openLogFd(path) {
  mkdirSync(dirname(path), { recursive: true });
  return openSync(path, "a");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
