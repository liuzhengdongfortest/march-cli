import { loadMarchSessionStateForPiBackend } from "../session/state/march-session-state.mjs";

export function loadOptionalWorkspaceMarchSessionState({ runtime, session }) {
  try {
    return loadWorkspaceMarchSessionState({ runtime, session });
  } catch {
    return null;
  }
}

export function loadWorkspaceMarchSessionState({ runtime, session }) {
  const stored = loadMarchSessionStateForPiBackend({
    projectMarchDir: runtime.projectMarchDir,
    sessionId: session.id,
    sessionRef: session.path,
  });
  if (!stored) throw new Error(`March session state not found for ${session.id}; refusing partial resume`);
  if (stored.state.cwd && stored.state.cwd !== runtime.runner.engine.cwd) {
    throw new Error(`March session state cwd mismatch for ${session.id}: ${stored.state.cwd}`);
  }
  return stored.state;
}
