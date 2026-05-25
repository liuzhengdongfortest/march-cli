import { basename, join } from "node:path";
import { createSessionControllerLeaseManager } from "../session/control/controller-lease.mjs";
import { loadOptionalWorkspaceMarchSessionState, loadWorkspaceMarchSessionState } from "./session-restore.mjs";
import { createViewOnlyRuntime } from "./view-runtime.mjs";

export function createWorkspaceSessionSupervisor({ initialRuntime, createProjectRuntime, viewSessionState = initialRuntime?.sessionState, onActivate = null, controllerLeases = createSessionControllerLeaseManager({ cwd: initialRuntime?.cwd }) }) {
  if (!initialRuntime?.project?.projectId) throw new Error("initial workspace runtime is missing project metadata");
  if (typeof createProjectRuntime !== "function") throw new Error("createProjectRuntime is required");

  const runtimes = new Map();
  let active = initialRuntime;
  let activeView = null;
  let disposed = false;
  rememberRuntime(initialRuntime);

  const runner = new Proxy({}, {
    get(_target, prop) {
      if (prop === "dispose") return dispose;
      if (prop === "getActiveWorkspaceRuntime") return getActive;
      if (prop === "activateWorkspaceSession") return activateWorkspaceSession;
      if (prop === "activateWorkspaceSessionById") return activateWorkspaceSessionById;
      if (prop === "startNewWorkspaceSession") return startNewWorkspaceSession;
      if (prop === "refreshActiveRuntime") return refreshActiveRuntime;
      if (prop === "viewWorkspaceSession") return viewWorkspaceSession;
      if (prop === "runTurn") return runActiveTurn;
      if (prop === "abort") return abortActiveTurn;
      if (prop === "startNewSession") return startActiveNewSession;
      if (prop === "switchPiSession") return switchActivePiSession;
      const current = getActive();
      const value = current.runner[prop];
      return typeof value === "function" ? value.bind(current.runner) : value;
    },
    set(_target, prop, value) {
      getActive().runner[prop] = value;
      return true;
    },
    has(_target, prop) {
      return prop === "dispose" || prop === "getActiveWorkspaceRuntime" || prop === "activateWorkspaceSession" || prop === "activateWorkspaceSessionById" || prop === "startNewWorkspaceSession" || prop === "refreshActiveRuntime" || prop === "viewWorkspaceSession" || prop === "runTurn" || prop === "abort" || prop === "startNewSession" || prop === "switchPiSession" || prop in getActive().runner;
    },
  });

  return {
    runner,
    getActive,
    hasRunningTurn,
    getRunningTurns,
    getRuntimeSummaries,
    refreshActiveRuntime,
    viewWorkspaceSession,
    activateWorkspaceSession,
    activateWorkspaceSessionById,
    startNewWorkspaceSession,
    dispose,
  };

  function getActive() {
    return activeView ?? active;
  }

  function hasRunningTurn() {
    return getRunningTurns().length > 0;
  }

  function getRunningTurns() {
    return Array.from(runtimes.values()).filter((runtime) => runtime.turnTask);
  }

  function getRuntimeSummaries() {
    return Array.from(runtimes.values()).map((runtime) => ({
      projectId: runtime.project.projectId,
      sessionId: getRuntimeSessionId(runtime),
      running: Boolean(runtime.turnTask),
      active: runtime === active,
    }));
  }

  function refreshActiveRuntime() {
    const current = getActive();
    if (!current.viewOnly) rememberRuntime(current);
    mirrorSessionState(viewSessionState, current.sessionState);
    onActivate?.({ projectId: current.project.projectId, sessionId: getRuntimeSessionId(current), runtime: current });
  }

  async function activateWorkspaceSessionById({ projects = [], projectId, sessionId }) {
    const project = projects.find((candidate) => candidate.projectId === projectId);
    if (!project) throw new Error(`workspace project not found: ${projectId}`);
    const session = project.sessions?.find((candidate) => candidate.id === sessionId) ?? null;
    if (sessionId && !session) throw new Error(`workspace session not found: ${sessionId}`);
    return await activateWorkspaceSession({ project, session });
  }

  async function startNewWorkspaceSession(project) {
    activeView = null;
    const previous = active;
    const runtime = await getIdleRuntimeForProject(project);
    active = runtime;
    const result = await active.runner.startNewSession();
    if (!result?.cancelled && result?.sessionId) {
      syncSessionState(active, result.sessionId);
      replaceRuntimeLease(active, acquireRuntimeLease(active, { sessionId: result.sessionId, sessionPath: result.sessionFile ?? null }));
      releaseIdleRuntimeLease(previous, active);
    }
    rememberRuntime(active);
    mirrorSessionState(viewSessionState, active.sessionState);
    onActivate?.({ projectId: active.project.projectId, sessionId: getRuntimeSessionId(active), runtime: active, restoreState: null });
    return { runtime: active, result };
  }

  async function activateWorkspaceSession({ project, session = null, force = false }) {
    if (disposed) throw new Error("workspace supervisor is already disposed");
    if (!project?.projectId) throw new Error("workspace project is required");

    let runtime = session?.id ? runtimes.get(runtimeKey(project.projectId, session.id)) : findIdleRuntime(project.projectId);
    if (!runtime) runtime = await createProjectRuntime(project);

    const targetSessionId = session?.id ?? null;
    const lease = targetSessionId ? acquireRuntimeLease(runtime, { sessionId: targetSessionId, sessionPath: session?.path ?? null }, { force }) : null;
    const previous = active;
    try {
      let restoreState = null;
      if (session?.path && getRuntimeSessionId(runtime) !== targetSessionId) {
        restoreState = loadWorkspaceMarchSessionState({ runtime, session });
        await runtime.runner.switchPiSession(session.path, restoreState);
      }
      if (targetSessionId) syncSessionState(runtime, targetSessionId);

      replaceRuntimeLease(runtime, lease);
      releaseIdleRuntimeLease(previous, runtime);
      activeView = null;
      active = runtime;
      rememberRuntime(runtime);
      mirrorSessionState(viewSessionState, runtime.sessionState);
      onActivate?.({ projectId: runtime.project.projectId, sessionId: getRuntimeSessionId(runtime), runtime, restoreState });
      return active;
    } catch (err) {
      lease?.release?.();
      throw err;
    }
  }

  function viewWorkspaceSession({ project, session }) {
    if (disposed) throw new Error("workspace supervisor is already disposed");
    if (!project?.projectId || !session?.id) throw new Error("workspace session is required");
    const baseRuntime = findIdleRuntime(project.projectId, { allowSessionRuntime: false }) ?? active;
    const restoreState = session.path ? loadOptionalWorkspaceMarchSessionState({ runtime: { ...baseRuntime, project, projectMarchDir: join(project.rootPath, ".march") }, session }) : null;
    const view = createViewOnlyRuntime({ project, session, baseRuntime, restoreState });
    activeView = view;
    mirrorSessionState(viewSessionState, view.sessionState);
    onActivate?.({ projectId: project.projectId, sessionId: session.id, runtime: view, restoreState, viewOnly: true });
    return view;
  }

  async function getIdleRuntimeForProject(project) {
    if (active.project.projectId === project.projectId && !active.turnTask) return active;
    const runtime = await createProjectRuntime(project);
    rememberRuntime(runtime);
    return runtime;
  }

  function findIdleRuntime(projectId, { allowSessionRuntime = true } = {}) {
    return Array.from(runtimes.values()).find((runtime) => {
      if (runtime.project.projectId !== projectId || runtime.turnTask) return false;
      return allowSessionRuntime || !getRuntimeSessionId(runtime);
    }) ?? null;
  }

  function rememberRuntime(runtime) {
    const key = runtimeKey(runtime.project.projectId, getRuntimeSessionId(runtime));
    for (const [candidateKey, candidate] of runtimes) {
      if (candidate === runtime && candidateKey !== key) runtimes.delete(candidateKey);
    }
    runtimes.set(key, runtime);
  }

  async function dispose() {
    if (disposed) return;
    disposed = true;
    const uniqueRuntimes = new Set(runtimes.values());
    await Promise.all(Array.from(uniqueRuntimes, async (runtime) => {
      releaseRuntimeLease(runtime);
      await runtime.runner.dispose?.();
      runtime.memoryStore?.close?.();
    }));
  }

  async function runActiveTurn(...args) {
    if (activeView) throw new Error("This session is view-only. Use /session and Take over control before sending prompts.");
    ensureRuntimeLease(active);
    return await active.runner.runTurn(...args);
  }

  function abortActiveTurn(...args) {
    if (activeView) throw new Error("This session is view-only; there is no local turn to abort.");
    ensureRuntimeLease(active);
    return active.runner.abort(...args);
  }

  async function startActiveNewSession(...args) {
    activeView = null;
    const result = await active.runner.startNewSession(...args);
    if (!result?.cancelled && result?.sessionId) {
      syncSessionState(active, result.sessionId);
      replaceRuntimeLease(active, acquireRuntimeLease(active, { sessionId: result.sessionId, sessionPath: result.sessionFile ?? null }));
      rememberRuntime(active);
      mirrorSessionState(viewSessionState, active.sessionState);
    }
    return result;
  }

  async function switchActivePiSession(sessionPath, restoreState = null, ...args) {
    activeView = null;
    const sessionId = sessionIdFromSessionPath(sessionPath);
    const lease = acquireRuntimeLease(active, { sessionId, sessionPath });
    try {
      const result = await active.runner.switchPiSession(sessionPath, restoreState, ...args);
      if (result?.cancelled) {
        lease.release?.();
        return result;
      }
      const stats = active.runner.getSessionStats?.() ?? {};
      syncSessionState(active, stats.sessionId ?? sessionId);
      replaceRuntimeLease(active, lease);
      rememberRuntime(active);
      mirrorSessionState(viewSessionState, active.sessionState);
      return result;
    } catch (err) {
      lease.release?.();
      throw err;
    }
  }

  function acquireRuntimeLease(runtime, session, options = {}) {
    if (!session?.sessionId) return null;
    return controllerLeases.acquire({
      sessionId: session.sessionId,
      sessionPath: session.sessionPath ?? getRuntimeSessionFile(runtime),
      projectMarchDir: runtime.projectMarchDir,
    }, options);
  }

  function ensureRuntimeLease(runtime) {
    const sessionId = getRuntimeSessionId(runtime);
    if (!sessionId) return null;
    if (!runtime.controllerLease) replaceRuntimeLease(runtime, acquireRuntimeLease(runtime, { sessionId }));
    runtime.controllerLease.assertOwned();
    return runtime.controllerLease;
  }

  function replaceRuntimeLease(runtime, lease) {
    if (runtime.controllerLease === lease) return;
    runtime.controllerLease?.release?.();
    runtime.controllerLease = lease;
  }

  function releaseRuntimeLease(runtime) {
    runtime.controllerLease?.release?.();
    runtime.controllerLease = null;
  }

  function releaseIdleRuntimeLease(runtime, nextRuntime) {
    if (!runtime || runtime === nextRuntime || runtime.turnTask) return;
    releaseRuntimeLease(runtime);
  }
}

function getRuntimeSessionId(runtime) {
  return runtime.sessionState?.sessionId ?? runtime.runner.getSessionStats?.()?.sessionId ?? null;
}

function getRuntimeSessionFile(runtime) {
  return runtime.runner.getSessionStats?.()?.sessionFile ?? null;
}

function syncSessionState(runtime, sessionId) {
  if (!runtime.sessionState || !sessionId) return;
  runtime.sessionState.sessionId = sessionId;
  runtime.sessionState.sessionDir = runtime.sessionsRoot ? join(runtime.sessionsRoot, sessionId) : runtime.sessionState.sessionDir;
}

function mirrorSessionState(target, source) {
  if (!target || !source) return;
  target.sessionId = source.sessionId;
  target.sessionDir = source.sessionDir;
}

function runtimeKey(projectId, sessionId = null) {
  return `${projectId}:${sessionId ?? ""}`;
}

function sessionIdFromSessionPath(sessionPath) {
  return basename(String(sessionPath)).replace(/\.jsonl?$/i, "");
}
