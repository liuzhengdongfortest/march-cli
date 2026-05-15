import { loadPiSessionSidecar } from "../../session/sidecar.mjs";

export function parseResumePiCommand(input) {
  if (input !== "/resume-pi" && !input.startsWith("/resume-pi ")) return { type: "none" };
  const id = input.slice("/resume-pi".length).trim();
  if (!id) return { type: "error", message: "Usage: /resume-pi <id>" };
  if (id.includes("/") || id.includes("\\")) {
    return { type: "error", message: "pi session id must be an id prefix, not a path" };
  }
  return { type: "resume-pi", id };
}

export async function resumePiSessionById(id, { runner, sessions, projectMarchDir, skillPool = [] }) {
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
    sidecar = loadPiSessionSidecar({ projectMarchDir, sessionRef: session.path });
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
  try {
    result = await runner.switchPiSession(session.path);
  } catch (err) {
    return [`Error: failed to switch pi session ${session.id}: ${err.message}`];
  }
  if (result?.cancelled) return [`Resume pi session cancelled: ${session.id}`];
  runner.engine.restoreSession(toContextSessionState(sidecar.state), skillPool, { replace: true });
  return [`Resumed pi session: ${session.id}`];
}

function toContextSessionState(sidecarState) {
  return { ...sidecarState };
}
