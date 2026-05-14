export function parseClonePiCommand(input) {
  if (input !== "/clone-pi" && !input.startsWith("/clone-pi ")) return { type: "none" };
  const rest = input.slice("/clone-pi".length).trim();
  if (rest) return { type: "error", message: "Usage: /clone-pi" };
  return { type: "clone-pi" };
}

export async function clonePiSession({ runner }) {
  if (!runner.canSwitchPiSession?.()) {
    return ["Error: /clone-pi requires the pi runtime host"];
  }

  let result;
  try {
    result = await runner.clonePiSession();
  } catch (err) {
    return [`Error: failed to clone pi session: ${err.message}`];
  }
  if (result?.cancelled) {
    return [`Clone pi session cancelled: ${result.sourceSessionId ?? "(unknown)"}`];
  }
  return [`Cloned pi session: ${result.sessionId} (from: ${result.sourceSessionId})`];
}
