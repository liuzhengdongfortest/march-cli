import { join, resolve } from "node:path";

export function createViewOnlyRuntime({ project, session, baseRuntime, restoreState }) {
  const projectRoot = resolveProjectRoot(project, baseRuntime);
  const sessionState = {
    sessionId: session.id,
    sessionDir: join(projectRoot, ".march", "sessions", session.id),
  };
  const runner = {
    engine: { cwd: projectRoot, turns: restoreState?.turns ?? [] },
    runtimeState: { engine: { cwd: projectRoot } },
    getSessionStats: () => ({ sessionId: session.id, sessionFile: session.path ?? null }),
    estimateContextTokens: () => null,
    canSwitchPiSession: () => false,
    runTurn: rejectViewOnlyControl,
    abort: rejectViewOnlyControl,
    startNewSession: rejectViewOnlyControl,
    switchPiSession: rejectViewOnlyControl,
  };
  return {
    ...baseRuntime,
    project,
    cwd: projectRoot,
    currentProject: project.displayName,
    projectMarchDir: join(projectRoot, ".march"),
    sessionsRoot: join(projectRoot, ".march", "sessions"),
    sessionState,
    runner,
    turnTask: null,
    viewOnly: true,
  };
}

function rejectViewOnlyControl() {
  throw new Error("This session is view-only. Use /session and Take over control before sending prompts.");
}

function resolveProjectRoot(project, fallbackRuntime) {
  return project?.rootPath ? resolve(project.rootPath) : fallbackRuntime.cwd;
}
