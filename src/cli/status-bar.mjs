import { visibleWidth } from "@mariozechner/pi-tui";

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
    return [`\x1b[48;5;236m\x1b[38;5;250m${padded}\x1b[0m`];
  }
}

export function normalizeStatusText(text) {
  const normalized = String(text || DEFAULT_STATUS_TEXT).replace(/\s+/g, " ").trim();
  return normalized || DEFAULT_STATUS_TEXT;
}

export function padToWidth(text, width) {
  const padding = Math.max(0, width - visibleWidth(text));
  return text + " ".repeat(padding);
}

export function fitStatusText(text, width) {
  const normalized = normalizeStatusText(text);
  if (visibleWidth(normalized) <= width) return normalized;

  const segments = normalized.split(" | ");
  if (segments.length < 2) return clipToWidth(normalized, width);

  const tail = segments.at(-1);
  const separator = " | ";
  const tailWidth = visibleWidth(tail);
  const separatorWidth = visibleWidth(separator);
  if (tailWidth + separatorWidth >= width) return clipToWidth(tail, width);

  const headWidth = width - tailWidth - separatorWidth;
  const head = clipToWidth(segments.slice(0, -1).join(separator), headWidth);
  return `${head}${separator}${tail}`;
}

export function clipToWidth(text, width) {
  let output = "";
  for (const char of Array.from(String(text || ""))) {
    const next = `${output}${char}`;
    if (visibleWidth(next) > width) break;
    output = next;
  }
  return output;
}
