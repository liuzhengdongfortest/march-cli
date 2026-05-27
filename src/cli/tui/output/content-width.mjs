import { visibleWidth } from "@earendil-works/pi-tui";

export function safeContentWidth(width) {
  return Math.max(1, Math.trunc(width));
}

export function contentWidthAfterPrefix(width, prefix = "") {
  return Math.max(1, safeContentWidth(width) - visibleWidth(stripAnsi(prefix)));
}

function stripAnsi(text) {
  return String(text ?? "").replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
}
