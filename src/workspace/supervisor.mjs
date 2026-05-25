import { join } from "node:path";
import { loadPiSessionSidecar } from "../session/sidecar.mjs";

export function createWorkspaceSessionSupervisor({ initialRuntime, createProjectRuntime, viewSessionState = initialRuntime?.sessionState, onActivate = null }) {
  if (!initialRuntime?.project?.projectId) throw new Error("initial workspace runtime is missing project metadata");
  if (typeof createProjectRuntime !== "function") throw new Error("createProjectRuntime is required");

  const runtimes = new Map([[initialRuntime.project.projectId, initialRuntime]]);
  let active = initialRuntime;
  let disposed = false;

  const runner = new Proxy({}, {
    get(_target, prop) {
      if (prop === "dispose") return dispose;
      if (prop === "getActiveWorkspaceRuntime") return getActive;
      if (prop === "activateWorkspaceSession") return activateWorkspaceSession;
      if (prop === "activateWorkspaceSessionById") return activateWorkspaceSessionById;
      if (prop === "startNewWorkspaceSession") return startNewWorkspaceSession;
      const value = active.runner[prop];
      return typeof value === "function" ? value.bind(active.runner) : value;
    },
    set(_target, prop, value) {
      active.runner[prop] = value;
      return true;
    },
    has(_target, prop) {
      return prop === "dispose" || prop === "getActiveWorkspaceRuntime" || prop === "activateWorkspaceSession" || prop === "activateWorkspaceSessionById" || prop === "startNewWorkspaceSession" || prop in active.runner;
    },
  });

  return {
    runner,
    getActive,
    hasRunningTurn,
    getRunningTurns,
    getRuntimeSummaries,
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

  async function activateWorkspaceSessionById({ projects = [], projectId, sessionId }) {
    const project = projects.find((candidate) => candidate.projectId === projectId);
    if (!project) throw new Error(`workspace project not found: ${projectId}`);
    const session = project.sessions?.find((candidate) => candidate.id === sessionId) ?? null;
    if (sessionId && !session) throw new Error(`workspace session not found: ${sessionId}`);
    return await activateWorkspaceSession({ project, session });
  }

  async function startNewWorkspaceSession(project) {
    await activateWorkspaceSession({ project, session: null });
    const result = await active.runner.startNewSession();
    if (!result?.cancelled && result?.sessionId) syncSessionState(active, result.sessionId);
    mirrorSessionState(viewSessionState, active.sessionState);
    onActivate?.({ projectId: active.project.projectId, sessionId: getRuntimeSessionId(active), runtime: active });
    return { runtime: active, result };
  }

  async function activateWorkspaceSession({ project, session = null }) {
    if (disposed) throw new Error("workspace supervisor is already disposed");
    if (!project?.projectId) throw new Error("workspace project is required");

    let runtime = runtimes.get(project.projectId);
    if (!runtime) {
      runtime = await createProjectRuntime(project);
      runtimes.set(project.projectId, runtime);
    }

    if (session?.path) {
      const currentSessionId = getRuntimeSessionId(runtime);
      if (runtime.turnTask && currentSessionId !== session.id) {
        throw new Error("this project already has a running session; same-project concurrent sessions are not enabled yet");
      }
      const restoreState = loadWorkspacePiSessionState({ runtime, session });
      await runtime.runner.switchPiSession(session.path, restoreState);
      syncSessionState(runtime, session.id);
    }

    active = runtime;
    mirrorSessionState(viewSessionState, runtime.sessionState);
    onActivate?.({ projectId: runtime.project.projectId, sessionId: getRuntimeSessionId(runtime), runtime });
    return active;
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

function loadWorkspacePiSessionState({ runtime, session }) {
  const sidecar = loadPiSessionSidecar({ projectMarchDir: runtime.projectMarchDir, sessionRef: session.path });
  if (!sidecar) throw new Error(`pi session sidecar not found for ${session.id}; refusing partial resume`);
  if (sidecar.state.cwd && sidecar.state.cwd !== runtime.runner.engine.cwd) {
    throw new Error(`pi session sidecar cwd mismatch for ${session.id}: ${sidecar.state.cwd}`);
  }
  return { ...sidecar.state };
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