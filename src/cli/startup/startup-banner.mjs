import { createRequire } from "node:module";
import { visibleWidth } from "@earendil-works/pi-tui";
import { MODES } from "../input/mode-state.mjs";
import { brightBlack, cyan, violet } from "../tui/ui-theme.mjs";

const CARD_WIDTH = 76;
const ANSI_RE = /\x1b\[[0-?]*[ -/]*[@-~]/g;
const { version: packageVersion = "0.1" } = createRequire(import.meta.url)("../../../package.json");

export function formatStartupBanner({ cwd, modelId = "model?", thinkingLevel = "thinking?", mode = MODES.DO, dumpContextPath = null } = {}) {
  const nextMode = mode === MODES.DISCUSS ? "Do" : "Discuss";
  const tip = dumpContextPath
    ? `${brightBlack("Tip:")} ${cyan("dumps:")} ${brightBlack(dumpContextPath)}`
    : `${brightBlack("Tip:")} ${brightBlack("Tab to")} ${cyan(nextMode)} ${brightBlack("·")} ${cyan("/help")} ${brightBlack("for commands")}`;
  return [
    "",
    ...renderStartupCard([
      `${cyan("  █▙  ▟█")}   ${violet("March")} ${brightBlack(`v${packageVersion}`)}`,
      `${cyan("  █▜▙▟▛█")}   ${brightBlack("Describe a task to get started.")}`,
      `${cyan("  ▀    ▀")}`,
      "",
      tip,
      brightBlack("March uses AI. Check for mistakes."),
    ]),
    "",
  ];
}

function renderStartupCard(contentLines, width = CARD_WIDTH) {
  const safeWidth = Math.max(24, Math.trunc(width));
  const innerWidth = safeWidth - 4;
  return [
    violet(`╭${"─".repeat(safeWidth - 2)}╮`),
    ...contentLines.map((line) => violet("│ ") + padAnsi(line, innerWidth) + violet(" │")),
    violet(`╰${"─".repeat(safeWidth - 2)}╯`),
  ];
}

function padAnsi(text, width) {
  const clipped = clipAnsi(text, width);
  const padding = Math.max(0, width - visibleWidth(stripAnsi(clipped)));
  return `${clipped}${" ".repeat(padding)}`;
}

function clipAnsi(text, width) {
  let output = "";
  let plainWidth = 0;
  let inAnsi = false;
  for (const ch of Array.from(String(text ?? ""))) {
    if (ch === "\x1b") inAnsi = true;
    if (inAnsi) {
      output += ch;
      if (/[@-~]/.test(ch)) inAnsi = false;
      continue;
    }
    const charWidth = visibleWidth(ch);
    if (plainWidth + charWidth > width) break;
    output += ch;
    plainWidth += charWidth;
  }
  return output;
}

function stripAnsi(text) {
  return String(text ?? "").replace(ANSI_RE, "");
}
