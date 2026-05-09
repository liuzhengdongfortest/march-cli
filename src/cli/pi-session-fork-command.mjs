export function parseForkPiCommand(input) {
  if (input !== "/fork-pi" && !input.startsWith("/fork-pi ")) return { type: "none" };
  const rest = input.slice("/fork-pi".length).trim();
  if (!rest) return { type: "fork-pi-candidates" };
  const parts = rest.split(/\s+/);
  if (parts.length === 2 && parts[1] === "--reset-context") {
    return { type: "fork-pi-reset", entryId: parts[0] };
  }
  if (parts.length === 1) {
    return { type: "error", message: "Usage: /fork-pi <entry-id> --reset-context" };
  }
  return { type: "error", message: "Usage: /fork-pi" };
}

export function listPiForkCandidates({ runner }) {
  if (!runner.canSwitchPiSession?.()) {
    return ["Error: /fork-pi requires --pi-runtime-host"];
  }

  let candidates;
  try {
    candidates = runner.getPiForkCandidates();
  } catch (err) {
    return [`Error: failed to list pi fork candidates: ${err.message}`];
  }
  if (!candidates.length) {
    return ["(no pi fork candidates)"];
  }

  return [
    "Pi fork candidates:",
    ...candidates.map((candidate, index) => {
      const text = singleLine(candidate.text).slice(0, 120) || "(empty)";
      return `${index + 1}. ${candidate.entryId}  ${text}`;
    }),
    "Use /fork-pi <entry-id> --reset-context to create a fork without inheriting ContextEngine state.",
  ];
}

function singleLine(text) {
  return String(text ?? "").replace(/\s+/g, " ").trim();
}

export async function forkPiSessionResetContext(entryId, { runner }) {
  if (!runner.canSwitchPiSession?.()) {
    return ["Error: /fork-pi requires --pi-runtime-host"];
  }

  let result;
  try {
    result = await runner.forkPiSessionWithResetContext(entryId);
  } catch (err) {
    return [`Error: failed to fork pi session: ${err.message}`];
  }
  if (result?.cancelled) {
    return [`Fork pi session cancelled: ${result.sourceSessionId ?? "(unknown)"}`];
  }

  const lines = [
    `Forked pi session: ${result.sessionId} (from: ${result.sourceSessionId}, entry: ${result.entryId})`,
    "ContextEngine reset: turns/pins/open files/skills were not inherited.",
  ];
  if (result.selectedText) {
    lines.push(`Selected prompt: ${singleLine(result.selectedText).slice(0, 120)}`);
  }
  return lines;
}
