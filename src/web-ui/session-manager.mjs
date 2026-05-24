import { readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, resolve } from "node:path";
import { createWebRuntimeHost } from "./runtime-host.mjs";

export function createWebSessionManager({ args, config, launchCwd, stateRoot, useRuntimeProcess = true } = {}) {
  const sessions = new Map();
  const activities = [];
  let activeSessionId = null;
  let nextSessionNumber = 1;

  async function createSession(workspacePath) {
    const workspace = resolveWorkspace(workspacePath, launchCwd);
    const id = `session-${Date.now().toString(36)}-${nextSessionNumber++}`;
    const runtime = await createWebRuntimeHost({ args, config, cwd: workspace, stateRoot, useRuntimeProcess });
    const session = { id, workspace, title: basename(workspace) || workspace, runtime, createdAt: Date.now() };
    sessions.set(id, session);
    activeSessionId = id;
    activities.unshift({ id: `activity:${id}`, action: `opened ${session.title}`, time: "now" });
    return toSessionSummary(session, true);
  }

  const listSessions = () => Array.from(sessions.values()).map((session) => toSessionSummary(session, session.id === activeSessionId));

  return {
    async createSession(workspacePath) { return createSession(workspacePath); },
    listSessions,
    snapshot(sessionId = activeSessionId) {
      const session = getOptionalSession(sessions, sessionId);
      if (!session) return createEmptySnapshot({ sessions, activeSessionId, activities });
      const model = session.runtime.snapshot();
      return { ...model, sessions: listSessions(), activity: activities, activeSessionId: session.id };
    },
    subscribe(sessionId, listener) { return getSession(sessions, sessionId).runtime.subscribe(listener); },
    runTurn(sessionId, prompt) { return getSession(sessions, sessionId).runtime.runTurn(prompt); },
    refreshProviderQuota(sessionId) { return getSession(sessions, sessionId).runtime.refreshProviderQuota?.() ?? null; },
    abort(sessionId) { return getSession(sessions, sessionId).runtime.abort?.(); },
    fsRoots() { return listFsRoots(launchCwd); },
    fsList(path) { return listFsDirectory(path); },
    async dispose() {
      await Promise.all(Array.from(sessions.values()).map((session) => session.runtime.dispose?.()));
      sessions.clear();
    },
  };
}

export function resolveWorkspace(requested, launchCwd = process.cwd()) {
  if (!requested || typeof requested !== "string") throw new Error("Missing workspace path");
  const workspace = resolve(launchCwd, requested);
  if (!isDirectory(workspace)) throw new Error(`Workspace does not exist or is not a directory: ${workspace}`);
  return workspace;
}

function getSession(sessions, id) {
  const session = getOptionalSession(sessions, id);
  if (!session) throw new Error("Session not found");
  return session;
}

function getOptionalSession(sessions, id) {
  if (!id) return null;
  return sessions.get(id) ?? null;
}

function toSessionSummary(session, active) {
  return { id: session.id, title: session.title, workspacePath: session.workspace, time: "now", active };
}

function createEmptySnapshot({ sessions, activeSessionId, activities }) {
  return {
    workspace: { id: "no-workspace", name: "Choose workspace", kind: "folder", selected: true },
    timeline: { title: "No session selected", meta: "Create a session and bind a workspace", events: [] },
    sessions: Array.from(sessions.values()).map((session) => toSessionSummary(session, session.id === activeSessionId)),
    providerQuota: null,
    activity: activities,
    activeSessionId: null,
    composer: { mode: "No session", placeholder: "Choose a workspace to start…" },
  };
}

function listFsRoots(launchCwd) {
  const roots = uniquePaths([launchCwd, homedir(), ...windowsDriveRoots()]);
  return roots.filter(isDirectory).map((path) => ({ name: path, path, kind: "root" }));
}

function windowsDriveRoots() {
  if (process.platform !== "win32") return ["/"];
  return Array.from({ length: 26 }, (_, index) => `${String.fromCharCode(65 + index)}:\\`);
}

function listFsDirectory(path) {
  const root = resolve(path);
  if (!isDirectory(root)) throw new Error(`Directory does not exist: ${root}`);
  return safeReadDir(root)
    .filter((entry) => entry.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 500)
    .map((entry) => ({ name: entry.name, path: resolve(root, entry.name), kind: "directory" }));
}

function uniquePaths(paths) {
  return Array.from(new Set(paths.filter(Boolean).map((path) => resolve(path))));
}

function isDirectory(path) {
  try { return statSync(path).isDirectory(); } catch { return false; }
}

function safeReadDir(path) {
  try { return readdirSync(path, { withFileTypes: true }); } catch { return []; }
}
