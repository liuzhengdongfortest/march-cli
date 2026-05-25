import { loadMarchSessionStateForPiBackend } from "../../session/state/march-session-state.mjs";

export async function resumePiSessionById(id, { runner, sessions, projectMarchDir }) {
  if (!runner.canSwitchPiSession?.()) {
    return ["Error: pi session resume requires the pi runtime host"];
  }

  const matches = sessions.filter((session) => session.id.startsWith(id));
  if (matches.length === 0) return [`Error: pi session not found: ${id}`];
  if (matches.length > 1) {
    return [`Error: pi session id is ambiguous: ${id} (${matches.map((session) => session.id).join(", ")})`];
  }

  const session = matches[0];
  let stored;
  try {
    stored = loadMarchSessionStateForPiBackend({ projectMarchDir, sessionId: session.id, sessionRef: session.path });
  } catch (err) {
    return [`Error: March session state is invalid for ${session.id}: ${err.message}`];
  }
  if (!stored) {
    return [`Error: March session state not found for ${session.id}; refusing partial resume`];
  }
  if (stored.state.cwd && stored.state.cwd !== runner.engine.cwd) {
    return [`Error: March session state cwd mismatch for ${session.id}: ${stored.state.cwd}`];
  }

  let result;
  const restoreState = toContextSessionState(stored.state);
  try {
    result = await runner.switchPiSession(session.path, restoreState);
  } catch (err) {
    return [`Error: failed to switch pi session ${session.id}: ${err.message}`];
  }
  if (result?.cancelled) return [`Resume pi session cancelled: ${session.id}`];
  return [`Resumed pi session: ${session.id}`];
}

function toContextSessionState(sessionState) {
  return { ...sessionState };
}
