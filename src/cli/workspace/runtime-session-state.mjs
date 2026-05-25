import { join } from "node:path";

export function syncRuntimeSessionStateFromRunner(sessionState, runner, sessionsRoot) {
  const sessionId = runner?.getSessionStats?.()?.sessionId ?? null;
  if (!sessionState || !sessionId) return null;
  sessionState.sessionId = sessionId;
  sessionState.sessionDir = sessionsRoot ? join(sessionsRoot, sessionId) : sessionState.sessionDir;
  return sessionState;
}
