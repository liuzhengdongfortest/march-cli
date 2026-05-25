import { loadPiSessionContextState } from "../../session/sidecar.mjs";

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
  let sidecar;
  try {
    sidecar = loadPiSessionContextState({ projectMarchDir, sessionRef: session.path });
  } catch (err) {
    return [`Error: pi session sidecar is invalid for ${session.id}: ${err.message}`];
  }
  if (!sidecar) {
    return [`Error: pi session sidecar not found for ${session.id}; refusing partial resume`];
  }
  if (sidecar.state.cwd && sidecar.state.cwd !== runner.engine.cwd) {
    return [`Error: pi session sidecar cwd mismatch for ${session.id}: ${sidecar.state.cwd}`];
  }

  let result;
  const restoreState = toContextSessionState(sidecar.state);
  try {
    result = await runner.switchPiSession(session.path, restoreState);
  } catch (err) {
    return [`Error: failed to switch pi session ${session.id}: ${err.message}`];
  }
  if (result?.cancelled) return [`Resume pi session cancelled: ${session.id}`];
  return [`Resumed pi session: ${session.id}`];
}

function toContextSessionState(sidecarState) {
  return { ...sidecarState };
}
