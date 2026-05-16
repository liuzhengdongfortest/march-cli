import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { brightBlack } from "../ui-theme.mjs";

export class SafeRenderBoundary {
  constructor(child, { onError = null } = {}) {
    this.child = child;
    this.onError = onError;
  }

  render(width) {
    const safeWidth = Math.max(1, Math.trunc(width));
    try {
      return sanitizeRenderedLines(this.child.render(safeWidth), safeWidth);
    } catch (err) {
      this.onError?.(err);
      return sanitizeRenderedLines([brightBlack(`March UI recovered from render error: ${err.message}`)], safeWidth);
    }
  }

  invalidate() {
    this.child.invalidate?.();
  }
}

export function sanitizeRenderedLines(lines, width) {
  const safeWidth = Math.max(1, Math.trunc(width));
  const result = [];
  for (const line of Array.isArray(lines) ? lines : []) {
    for (const part of String(line ?? "").split(/\r?\n/)) {
      result.push(fitRenderedLine(part, safeWidth));
    }
  }
  return result;
}

function fitRenderedLine(line, width) {
  if (visibleWidth(line) <= width) return line;
  const truncated = truncateToWidth(line, width, "…");
  if (visibleWidth(truncated) <= width) return truncated;
  const plain = truncateToWidth(stripAnsi(line), width, "…");
  return visibleWidth(plain) <= width ? plain : "";
}

function stripAnsi(text) {
  return String(text ?? "").replace(/\x1b(?:\][^\x07]*(?:\x07|\x1b\\)|[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "");
}
