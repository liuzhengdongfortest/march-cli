import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { BROWSER_DAEMON_HOST, BROWSER_DAEMON_PORT, BROWSER_DAEMON_STATE_FILE } from "../daemon/constants.mjs";

export function browserDaemonStatePath(stateRoot) {
  return join(stateRoot, BROWSER_DAEMON_STATE_FILE);
}

export function defaultBrowserDaemonState() {
  return {
    pid: null,
    url: `http://${BROWSER_DAEMON_HOST}:${BROWSER_DAEMON_PORT}`,
    wsUrl: `ws://${BROWSER_DAEMON_HOST}:${BROWSER_DAEMON_PORT}/extension`,
    startedAt: null,
  };
}

export function readBrowserDaemonState(stateRoot) {
  const path = browserDaemonStatePath(stateRoot);
  if (!existsSync(path)) return defaultBrowserDaemonState();
  try {
    return { ...defaultBrowserDaemonState(), ...JSON.parse(readFileSync(path, "utf8")) };
  } catch {
    return defaultBrowserDaemonState();
  }
}

export function writeBrowserDaemonState(stateRoot, state) {
  mkdirSync(stateRoot, { recursive: true });
  writeFileSync(browserDaemonStatePath(stateRoot), JSON.stringify(state, null, 2));
}

export function removeBrowserDaemonState(stateRoot) {
  try { rmSync(browserDaemonStatePath(stateRoot), { force: true }); } catch {}
}
