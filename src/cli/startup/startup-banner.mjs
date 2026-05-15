import { MODES } from "../input/mode-state.mjs";
import { bold, brightBlack, cyan } from "../tui/ui-theme.mjs";

export function formatStartupBanner({ cwd, modelId = "model?", thinkingLevel = "thinking?", mode = MODES.DO, dumpContextPath = null } = {}) {
  const nextMode = mode === MODES.DISCUSS ? "Do" : "Discuss";
  const hint = dumpContextPath
    ? brightBlack(`dumps: ${dumpContextPath}`)
    : brightBlack(`Tab to ${nextMode} · /help`);
  return [
    `${cyan("  █▙  ▟█")}   ${bold("March")}`,
    `${cyan("  █▜▙▟▛█")}   ${brightBlack(`${modelId} · ${thinkingLevel}`)}`,
    `${cyan("  ▀    ▀")}   ${brightBlack(cwd ?? "")}`,
    "",
    `  ${hint}`,
    "",
  ];
}
