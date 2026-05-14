import { visibleWidth } from "@mariozechner/pi-tui";
import { statusBar, R } from "../ui-theme.mjs";

const ANSI_RE = /\x1b\[[0-?]*[ -/]*[@-~]/g;
const DEFAULT_STATUS_TEXT = "March";

export class StatusBar {
  constructor(text = DEFAULT_STATUS_TEXT) {
    this.text = normalizeStatusText(text);
  }

  setText(text) {
    this.text = normalizeStatusText(text);
  }

  invalidate() {}

  render(width) {
    if (width <= 0) return [""];
    const text = fitStatusText(this.text, width);
    const padded = padToWidth(text, width);
    // If text already has ANSI coloring, only apply background
    if (hasAnsi(padded)) {
      return [statusBar.background(`${padded}${R}`)];
    }
    return [statusBar.background(statusBar.text(padded))];
  }
}

function hasAnsi(text) {
  return ANSI_RE.test(text);
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
