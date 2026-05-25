import { join } from "node:path";
import { loadMarchSessionStateForPiBackend } from "../session/state/march-session-state.mjs";

export function createWorkspaceSessionSupervisor({ initialRuntime, createProjectRuntime, viewSessionState = initialRuntime?.sessionState, onActivate = null }) {
  if (!initialRuntime?.project?.projectId) throw new Error("initial workspace runtime is missing project metadata");
  if (typeof createProjectRuntime !== "function") throw new Error("createProjectRuntime is required");

  const runtimes = new Map();
  let active = initialRuntime;
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
      const value = active.runner[prop];
      return typeof value === "function" ? value.bind(active.runner) : value;
    },
    set(_target, prop, value) {
      active.runner[prop] = value;
      return true;
    },
    has(_target, prop) {
      return prop === "dispose" || prop === "getActiveWorkspaceRuntime" || prop === "activateWorkspaceSession" || prop === "activateWorkspaceSessionById" || prop === "startNewWorkspaceSession" || prop === "refreshActiveRuntime" || prop in active.runner;
    },
  });

  return {
    runner,
    getActive,
    hasRunningTurn,
    getRunningTurns,
    getRuntimeSummaries,
    refreshActiveRuntime,
    activateWorkspaceSession,
    activateWorkspaceSessionById,
    startNewWorkspaceSession,
    dispose,
  };

  function getActive() {
    return active;
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
    rememberRuntime(active);
    mirrorSessionState(viewSessionState, active.sessionState);
    onActivate?.({ projectId: active.project.projectId, sessionId: getRuntimeSessionId(active), runtime: active });
  }

  async function activateWorkspaceSessionById({ projects = [], projectId, sessionId }) {
    const project = projects.find((candidate) => candidate.projectId === projectId);
    if (!project) throw new Error(`workspace project not found: ${projectId}`);
    const session = project.sessions?.find((candidate) => candidate.id === sessionId) ?? null;
    if (sessionId && !session) throw new Error(`workspace session not found: ${sessionId}`);
    return await activateWorkspaceSession({ project, session });
  }

  async function startNewWorkspaceSession(project) {
    const runtime = await getIdleRuntimeForProject(project);
    active = runtime;
    const result = await active.runner.startNewSession();
    if (!result?.cancelled && result?.sessionId) syncSessionState(active, result.sessionId);
    rememberRuntime(active);
    mirrorSessionState(viewSessionState, active.sessionState);
    onActivate?.({ projectId: active.project.projectId, sessionId: getRuntimeSessionId(active), runtime: active, restoreState: null });
    return { runtime: active, result };
  }

  async function activateWorkspaceSession({ project, session = null }) {
    if (disposed) throw new Error("workspace supervisor is already disposed");
    if (!project?.projectId) throw new Error("workspace project is required");

    let runtime = session?.id ? runtimes.get(runtimeKey(project.projectId, session.id)) : findIdleRuntime(project.projectId);
    if (!runtime) runtime = await createProjectRuntime(project);

    let restoreState = null;
    if (session?.path && getRuntimeSessionId(runtime) !== session.id) {
      restoreState = loadWorkspaceMarchSessionState({ runtime, session });
      await runtime.runner.switchPiSession(session.path, restoreState);
      syncSessionState(runtime, session.id);
    }

    active = runtime;
    rememberRuntime(runtime);
    mirrorSessionState(viewSessionState, runtime.sessionState);
    onActivate?.({ projectId: runtime.project.projectId, sessionId: getRuntimeSessionId(runtime), runtime, restoreState });
    return active;
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
      await runtime.runner.dispose?.();
      runtime.memoryStore?.close?.();
    }));
  }
}

function loadWorkspaceMarchSessionState({ runtime, session }) {
  const stored = loadMarchSessionStateForPiBackend({
    projectMarchDir: runtime.projectMarchDir,
    sessionId: session.id,
    sessionRef: session.path,
  });
  if (!stored) throw new Error(`March session state not found for ${session.id}; refusing partial resume`);
  if (stored.state.cwd && stored.state.cwd !== runtime.runner.engine.cwd) {
    throw new Error(`March session state cwd mismatch for ${session.id}: ${stored.state.cwd}`);
  }
  return { ...stored.state };
}

function getRuntimeSessionId(runtime) {
  return runtime.runner.getSessionStats?.()?.sessionId ?? runtime.sessionState?.sessionId ?? null;
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
