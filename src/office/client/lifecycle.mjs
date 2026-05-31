import { spawn } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { requestOfficeDaemon } from "./http.mjs";
import { officeDaemonStatePath, readOfficeDaemonState, removeOfficeDaemonState } from "./state.mjs";

const STARTUP_TIMEOUT_MS = 5000;
const STARTUP_POLL_MS = 120;

export async function ensureOfficeDaemon({ stateRoot, quiet = true } = {}) {
  const state = readOfficeDaemonState(stateRoot);
  if (await pingOfficeDaemon(state.url)) return state;

  removeOfficeDaemonState(stateRoot);
  const logPath = officeDaemonLogPath(stateRoot);
  const logFds = quiet ? [openLogFd(logPath), openLogFd(logPath)] : [];
  const child = spawn(process.execPath, [daemonEntryPath(), "--state-root", stateRoot], {
    detached: true,
    stdio: quiet ? ["ignore", logFds[0], logFds[1]] : "inherit",
    windowsHide: true,
  });
  for (const fd of logFds) closeFd(fd);

  const childState = createChildStartupState(child);
  child.unref();

  const statePath = officeDaemonStatePath(stateRoot);
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  let lastProbe = null;
  let lastState = null;
  while (Date.now() < deadline) {
    await sleep(STARTUP_POLL_MS);
    if (childState.exited) break;
    if (!existsSync(statePath)) {
      lastProbe = { ok: false, error: new Error("state file missing") };
      continue;
    }

    lastState = readOfficeDaemonState(stateRoot);
    if (lastState.pid !== child.pid) {
      lastProbe = { ok: false, error: new Error(`state pid mismatch: expected ${child.pid}, got ${lastState.pid ?? "none"}`) };
      continue;
    }

    lastProbe = await probeOfficeDaemon(lastState.url);
    if (lastProbe.ok) return lastState;
  }

  throw new Error(formatOfficeDaemonStartupError({
    childPid: child.pid,
    childState,
    statePath,
    state: lastState,
    logPath,
    lastError: lastProbe?.error,
  }));
}

export async function pingOfficeDaemon(url) {
  return (await probeOfficeDaemon(url)).ok;
}

export async function probeOfficeDaemon(url, { timeoutMs = 700 } = {}) {
  try {
    const status = await requestOfficeDaemon(url, "/status", null, { timeoutMs });
    return { ok: Boolean(status?.ok), status };
  } catch (err) {
    return { ok: false, error: err };
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

export function officeDaemonLogPath(stateRoot) {
  return join(stateRoot, "office-daemon.log");
}

export function formatOfficeDaemonStartupError({ childPid, childState, statePath, state, logPath, lastError }) {
  const details = [
    `Office daemon did not start`,
    `childPid=${childPid ?? "unknown"}`,
    `child=${formatChildState(childState)}`,
    `stateFile=${existsSync(statePath) ? statePath : `${statePath} (missing)`}`,
    `statePid=${state?.pid ?? "none"}`,
    `lastError=${formatOfficeDaemonError(lastError)}`,
    `log=${logPath}`,
  ];
  return details.join("; ");
}

export function formatOfficeDaemonError(err) {
  if (!err) return "none";
  const cause = err.cause;
  if (cause?.code) return `${err.message} (${cause.code})`;
  if (err.name === "AbortError") return "request timed out";
  return err.message ?? String(err);
}

async function waitForOfficeDaemonStopped(url) {
  const deadline = Date.now() + 2500;
  while (Date.now() < deadline) {
    if (!await pingOfficeDaemon(url)) return;
    await sleep(100);
  }
}

function createChildStartupState(child) {
  const state = { exited: false, exitCode: null, signal: null, error: null };
  child.once("error", (err) => {
    state.exited = true;
    state.error = err;
  });
  child.once("exit", (code, signal) => {
    state.exited = true;
    state.exitCode = code;
    state.signal = signal;
  });
  return state;
}

function formatChildState(state) {
  if (!state) return "unknown";
  if (state.error) return `error:${formatOfficeDaemonError(state.error)}`;
  if (state.exited) return `exit:${state.exitCode ?? "null"}${state.signal ? ` signal:${state.signal}` : ""}`;
  return "running";
}

function daemonEntryPath() {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../daemon/entry.mjs");
}

function openLogFd(path) {
  mkdirSync(dirname(path), { recursive: true });
  return openSync(path, "a");
}

function closeFd(fd) {
  try { closeSync(fd); } catch {}
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
