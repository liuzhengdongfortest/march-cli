export function parseResumePiCommand(input) {
  if (input !== "/resume-pi" && !input.startsWith("/resume-pi ")) return { type: "none" };
  const id = input.slice("/resume-pi".length).trim();
  if (!id) return { type: "error", message: "Usage: /resume-pi <id>" };
  if (id.includes("/") || id.includes("\\")) {
    return { type: "error", message: "pi session id must be an id prefix, not a path" };
  }
  return { type: "resume-pi", id };
}

export async function resumePiSessionById(id, { runner, sessions }) {
  if (!runner.canSwitchPiSession?.()) {
    return ["Error: /resume-pi requires --pi-runtime-host"];
  }

  const matches = sessions.filter((session) => session.id.startsWith(id));
  if (matches.length === 0) return [`Error: pi session not found: ${id}`];
  if (matches.length > 1) {
    return [`Error: pi session id is ambiguous: ${id} (${matches.map((session) => session.id).join(", ")})`];
  }

  const session = matches[0];
  const result = await runner.switchPiSession(session.path);
  if (result?.cancelled) return [`Resume pi session cancelled: ${session.id}`];
  return [`Resumed pi session: ${session.id}`];
}
