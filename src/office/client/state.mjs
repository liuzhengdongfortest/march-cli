import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { OFFICE_DAEMON_HOST, OFFICE_DAEMON_PORT, OFFICE_DAEMON_STATE_FILE } from "../daemon/constants.mjs";

export function officeDaemonStatePath(stateRoot) {
  return join(stateRoot, OFFICE_DAEMON_STATE_FILE);
}

export function defaultOfficeDaemonState() {
  return {
    pid: null,
    url: `http://${OFFICE_DAEMON_HOST}:${OFFICE_DAEMON_PORT}`,
    wsUrl: `ws://${OFFICE_DAEMON_HOST}:${OFFICE_DAEMON_PORT}/addin`,
    startedAt: null,
  };
}

export function readOfficeDaemonState(stateRoot) {
  const path = officeDaemonStatePath(stateRoot);
  if (!existsSync(path)) return defaultOfficeDaemonState();
  try {
    return { ...defaultOfficeDaemonState(), ...JSON.parse(readFileSync(path, "utf8")) };
  } catch {
    return defaultOfficeDaemonState();
  }
}

export function writeOfficeDaemonState(stateRoot, state) {
  mkdirSync(stateRoot, { recursive: true });
  writeFileSync(officeDaemonStatePath(stateRoot), JSON.stringify(state, null, 2));
}

export function removeOfficeDaemonState(stateRoot) {
  try { rmSync(officeDaemonStatePath(stateRoot), { force: true }); } catch {}
}
