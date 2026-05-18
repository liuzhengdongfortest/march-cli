import { visibleWidth } from "@earendil-works/pi-tui";
import { statusBar, R } from "../ui-theme.mjs";

const ANSI_RE = /\x1b\[[0-?]*[ -/]*[@-~]/g;
const DEFAULT_STATUS_TEXT = "March";
const DEFAULT_HELP_TEXT = "/help for commands · Tab toggles mode · Ctrl+C exits";
const PANEL_BG = "\x1b[48;5;235m";

export class StatusBar {
  constructor(text = DEFAULT_STATUS_TEXT, { cwd = process.cwd(), helpText = DEFAULT_HELP_TEXT } = {}) {
    this.text = normalizeStatusText(text);
    this.cwd = normalizeStatusText(cwd);
    this.helpText = normalizeStatusText(helpText);
  }

  setText(text) {
    const next = normalizeStatusText(text);
    if (next === this.text) return false;
    this.text = next;
    return true;
  }

  setCwd(cwd) {
    const next = normalizeStatusText(cwd);
    if (next === this.cwd) return false;
    this.cwd = next;
    return true;
  }

  invalidate() {}

  render(width) {
    return this.renderTop(width);
  }

  renderTop(width) {
    if (width <= 0) return [""];
    return [statusBar.cwd(padToWidth(clipToWidth(this.cwd, width), width))];
  }

  renderInputLine(line, width) {
    if (width <= 0) return "";
    return applyBackground(padToWidth(line, width));
  }

  renderBottom(width) {
    if (width <= 0) return [""];
    const model = modelSegment(this.text);
    const left = leftStatusSegment(this.text, this.helpText);
    return [applyBackground(composeBottomLine({ left, right: model, width }))];
  }
}

function composeBottomLine({ left, right, width }) {
  const safeWidth = Math.max(1, Math.trunc(width));
  const rightText = right ? statusBar.accent(right) : "";
  const rightWidth = visibleWidth(stripAnsi(right));
  if (!right) return statusBar.muted(padToWidth(clipToWidth(left, safeWidth), safeWidth));
  if (rightWidth >= safeWidth) return statusBar.accent(padToWidth(clipToWidth(right, safeWidth), safeWidth));

  const maxLeftWidth = Math.max(0, safeWidth - rightWidth - 1);
  const fittedLeft = maxLeftWidth > 0 ? clipToWidth(left, maxLeftWidth) : "";
  const gap = Math.max(1, safeWidth - visibleWidth(stripAnsi(fittedLeft)) - rightWidth);
  return `${statusBar.muted(fittedLeft)}${" ".repeat(gap)}${rightText}${R}`;
}

function applyBackground(line) {
  return `${PANEL_BG}${String(line).replaceAll(R, `${R}${PANEL_BG}`)}${R}`;
}

function modelSegment(text) {
  const segments = plainSegments(text);
  return segments[1] || segments[0] || "March";
}

function leftStatusSegment(text, helpText) {
  const segments = plainSegments(text);
  const left = [segments[0], ...segments.slice(2)].filter(Boolean).join(" · ");
  return left || helpText;
}

function plainSegments(text) {
  return stripAnsi(normalizeStatusText(text))
    .split(" | ")
    .map((segment) => segment.trim())
    .filter(Boolean);
}

export function normalizeStatusText(text) {
  const normalized = String(text || DEFAULT_STATUS_TEXT).replace(/\s+/g, " ").trim();
  return normalized || DEFAULT_STATUS_TEXT;
}

export function padToWidth(text, width) {
  const plainWidth = visibleWidth(stripAnsi(text));
  const padding = Math.max(0, width - plainWidth);
  return text + " ".repeat(padding);
}

export function fitStatusText(text, width) {
  const normalized = normalizeStatusText(text);
  if (visibleWidth(stripAnsi(normalized)) <= width) return normalized;

  const segments = normalized.split(" | ");
  if (segments.length < 2) return clipToWidth(normalized, width);

  const tail = segments.at(-1);
  const separator = " | ";
  const tailWidth = visibleWidth(stripAnsi(tail));
  const separatorWidth = visibleWidth(separator);
  if (tailWidth + separatorWidth >= width) return clipToWidth(tail, width);

  const headWidth = width - tailWidth - separatorWidth;
  const head = clipToWidth(segments.slice(0, -1).join(separator), headWidth);
  return `${head}${separator}${tail}`;
}

export function clipToWidth(text, width) {
  // For ANSI-containing text, build output character by character and measure plain width
  let output = "";
  let plainWidth = 0;
  let inAnsi = false;
  for (const ch of Array.from(String(text || ""))) {
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
