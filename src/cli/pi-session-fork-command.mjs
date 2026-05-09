export function parseForkPiCommand(input) {
  if (input !== "/fork-pi" && !input.startsWith("/fork-pi ")) return { type: "none" };
  const rest = input.slice("/fork-pi".length).trim();
  if (rest) return { type: "error", message: "Usage: /fork-pi" };
  return { type: "fork-pi-candidates" };
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
    "Read-only: historical /fork-pi writes are not enabled yet.",
  ];
}

function singleLine(text) {
  return String(text ?? "").replace(/\s+/g, " ").trim();
}
