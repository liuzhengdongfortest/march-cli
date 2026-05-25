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
      const value = active.runner[prop];
      return typeof value === "function" ? value.bind(active.runner) : value;
    },
    set(_target, prop, value) {
      active.runner[prop] = value;
      return true;
    },
    has(_target, prop) {
      return prop === "dispose" || prop === "getActiveWorkspaceRuntime" || prop === "activateWorkspaceSession" || prop in active.runner;
    },
  });

  return {
    runner,
    getActive,
    hasRunningTurn,
    getRunningTurns,
    activateWorkspaceSession,
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

  async function activateWorkspaceSession({ project, session = null }) {
    if (disposed) throw new Error("workspace supervisor is already disposed");
    if (!project?.projectId) throw new Error("workspace project is required");

    let runtime = runtimes.get(project.projectId);
    if (!runtime) {
      runtime = await createProjectRuntime(project);
      runtimes.set(project.projectId, runtime);
    }

    active = runtime;
    if (session?.path) {
      const restoreState = loadWorkspacePiSessionState({ runtime, session });
      await runtime.runner.switchPiSession(session.path, restoreState);
      syncSessionState(runtime, session.id);
    }
    mirrorSessionState(viewSessionState, runtime.sessionState);
    onActivate?.({ projectId: runtime.project.projectId, runtime });
    return active;
  }

  async function dispose() {
    if (disposed) return;
    disposed = true;
    const uniqueRuntimes = new Set(runtimes.values());
    await Promise.all(Array.from(uniqueRuntimes, async (runtime) => {
      await runtime.runner.dispose?.();
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