import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";

const BORDER = "\x1b[38;5;238m";
const RESET = "\x1b[0m";
const SEPARATOR = `${BORDER}│${RESET}`;
const SEPARATOR_WIDTH = 1;
const MIN_LEFT_WIDTH = 34;
const MIN_SHELL_WIDTH = 34;
const MAX_SHELL_WIDTH = 72;
const SHELL_WIDTH_RATIO = 0.36;

export class ShellSplitLayout {
  constructor({ mainChildren = [], shellPane }) {
    this.mainChildren = mainChildren;
    this.shellPane = shellPane;
  }

  render(width) {
    const safeWidth = Math.max(1, Math.trunc(width));
    if (!this.shellPane?.isVisible?.() || safeWidth < 3) {
      return renderStack(this.mainChildren, safeWidth);
    }

    const shellWidth = computeShellWidth(safeWidth);
    const mainWidth = Math.max(1, safeWidth - shellWidth - SEPARATOR_WIDTH);
    const mainLines = renderStack(this.mainChildren, mainWidth);
    const shellLines = this.shellPane.render(shellWidth);
    const rowCount = Math.max(mainLines.length, shellLines.length);
    const lines = [];

    for (let i = 0; i < rowCount; i += 1) {
      const left = padToWidth(mainLines[i] ?? "", mainWidth);
      const right = padToWidth(shellLines[i] ?? "", shellWidth);
      lines.push(`${left}${SEPARATOR}${right}`);
    }
    return lines;
  }

  invalidate() {
    for (const child of this.mainChildren) child.invalidate?.();
    this.shellPane?.invalidate?.();
  }
}

export function computeShellWidth(totalWidth) {
  const available = Math.max(1, Math.trunc(totalWidth) - SEPARATOR_WIDTH);
  if (available <= 1) return 1;
  const maxWithLeftFloor = available - MIN_LEFT_WIDTH;
  if (maxWithLeftFloor < MIN_SHELL_WIDTH) {
    return Math.max(1, Math.floor(available / 2));
  }
  const target = Math.floor(totalWidth * SHELL_WIDTH_RATIO);
  return clamp(target, MIN_SHELL_WIDTH, Math.min(MAX_SHELL_WIDTH, maxWithLeftFloor));
}

function renderStack(children, width) {
  const lines = [];
  for (const child of children) {
    for (const line of child.render(width)) lines.push(line);
  }
  return lines;
}

function padToWidth(text, width) {
  const fitted = visibleWidth(text) > width ? truncateToWidth(text, width) : text;
  return `${fitted}${" ".repeat(Math.max(0, width - visibleWidth(fitted)))}`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
