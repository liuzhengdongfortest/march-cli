export function buildRuntimeStatus({
  turns = [],
  sessionName = "",
  openFilesCount = 0,
  pins = [],
  now = new Date(),
} = {}) {
  const turnCount = turns.length;
  const pressure = turnCount > 15 ? "high" : turnCount > 8 ? "moderate" : "low";
  const parts = [
    `time: ${now.toISOString()}`,
    `turn: ${turnCount + 1}`,
    `context_pressure: ${pressure}`,
  ];
  if (sessionName) parts.push(`session_name: ${sessionName}`);
  parts.push(`open_files: ${openFilesCount}`);
  if (pins.length > 0) {
    parts.push("pinned_files:");
    for (const path of pins) {
      parts.push(`  - ${path}`);
    }
  }
  return `[runtime_status]\n${parts.join("\n")}`;
}
