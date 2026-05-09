import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";

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
    const text = truncateToWidth(this.text, width);
    const padded = padToWidth(text, width);
    return [`\x1b[7;90m${padded}\x1b[0m`];
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
