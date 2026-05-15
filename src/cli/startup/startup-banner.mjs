import { formatModeLabel, MODES } from "../input/mode-state.mjs";
import { bold, brightBlack, cyan, green, yellow } from "../tui/ui-theme.mjs";

export function formatStartupBanner({ cwd, modelId = "model?", thinkingLevel = "thinking?", mode = MODES.DO, dumpContextPath = null } = {}) {
  const modeLabel = formatModeLabel(mode);
  const colorMode = mode === MODES.DISCUSS ? yellow : green;
  const nextMode = mode === MODES.DISCUSS ? "Do" : "Discuss";
  const hint = dumpContextPath
    ? `${colorMode(modeLabel)} ${brightBlack(`· dumps: ${dumpContextPath}`)}`
    : `${colorMode(modeLabel)} ${brightBlack(`· Tab to ${nextMode} · /help`)}`;
  return [
    `${cyan("  █▙  ▟█")}   ${bold("March")}`,
    `${cyan("  █▜▙▟▛█")}   ${brightBlack(`${modelId} · ${thinkingLevel}`)}`,
    `${cyan("  ▀    ▀")}   ${brightBlack(cwd ?? "")}`,
    "",
    `  ${hint}`,
    "",
  ];
}
