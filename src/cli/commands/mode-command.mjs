import { MODES, formatModeLabel } from "../input/mode-state.mjs";

export function parseModeCommand(input) {
  const trimmed = String(input ?? "").trim();
  if (trimmed === "/mode") return { type: "show" };
  if (trimmed === "/do") return { type: "set", mode: MODES.DO };
  if (trimmed === "/discuss") return { type: "set", mode: MODES.DISCUSS };
  return { type: "none" };
}

export function handleModeCommand(command, { modeState } = {}) {
  if (!modeState || typeof modeState.get !== "function") {
    return ["Mode switching is unavailable in this runtime."];
  }

  if (command.type === "set") {
    modeState.set(command.mode);
  }

  return [`Mode: ${formatModeLabel(modeState.get())}`];
}
