export function stripAnsi(text) {
  return String(text ?? "").replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
}
