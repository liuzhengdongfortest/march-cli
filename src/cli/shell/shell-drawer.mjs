import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { PREFIX, R } from "../tui/ui-theme.mjs";

const CONTROL_RE = /\x1b(?:\][^\x07]*(?:\x07|\x1b\\)|\[(?![0-9;]*m)[0-?]*[ -/]*[@-~]|[@-Z\\-_])/g;
const HEADER = PREFIX.fg250;
const MUTED = PREFIX.brightBlack;
const BORDER = PREFIX.fg238;
const ACTIVE = PREFIX.cyan;
const RESET = R;

export class ShellDrawer {
  constructor({ shellRuntime = null, maxOutputLines = 10 } = {}) {
    this.shellRuntime = shellRuntime;
    this.maxOutputLines = maxOutputLines;
    this.visible = false;
    this.selectedShellId = null;
    this.scrollOffset = 0;
    this.shellSizes = new Map();
  }

  toggle() {
    this.visible = !this.visible;
    return this.visible;
  }

  isVisible() {
    return this.visible;
  }

  isInputActive() {
    return this.visible && Boolean(this.getSelectedShell());
  }

  sendInput(data) {
    const shell = this.getSelectedShell();
    if (!shell || !this.shellRuntime) {
      return { ok: false, error: "no shell selected" };
    }
    return this.shellRuntime.sendShell(shell.id, data);
  }

  selectNextShell() {
    const shells = this.getShells();
    if (!shells.length) {
      this.selectedShellId = null;
      return null;
    }
    const currentIndex = Math.max(0, shells.findIndex((shell) => shell.id === this.selectedShellId));
    const next = shells[(currentIndex + 1) % shells.length];
    this.selectedShellId = next.id;
    this.scrollOffset = 0;
    return next;
  }

  scroll(delta) {
    const outputLines = this.getOutputLines();
    const maxOffset = Math.max(0, outputLines.length - this.maxOutputLines);
    this.scrollOffset = clamp(this.scrollOffset + (delta < 0 ? 1 : -1), 0, maxOffset);
    return {
      offset: this.scrollOffset,
      maxOffset,
      atTail: this.scrollOffset === 0,
    };
  }

  render(width) {
    if (!this.visible) return [];
    const safeWidth = Math.max(1, width);
    const shell = this.getSelectedShell();
    const lines = [
      `${BORDER}${"─".repeat(Math.max(1, safeWidth))}${RESET}`,
    ];

    if (!this.shellRuntime) {
      lines.push(fit(`${MUTED}shell pane: disabled  focus:editor  started with --no-shell-runtime${RESET}`, safeWidth));
      return lines;
    }

    if (!shell) {
      lines.push(fit(`${MUTED}shell pane: no shells  focus:editor${RESET}`, safeWidth));
      return lines;
    }

    const shells = this.getShells();

    // Tab bar: all shells with active highlighted
    if (shells.length > 1) {
      const tabs = shells.map((s) => {
        const label = `${s.status === "running" ? "●" : "○"} ${s.name}`;
        if (s.id === shell.id) return `${ACTIVE}${label}${MUTED}`;
        return `${MUTED}${label}`;
      }).join(` ${BORDER}│${MUTED} `);
      lines.push(fit(`${MUTED}shells: ${tabs}${RESET}`, safeWidth));
    }

    const args = shell.args?.length ? ` ${shell.args.join(" ")}` : "";
    this.syncShellSize(shell.id, safeWidth, this.maxOutputLines);
    const outputLines = this.getOutputLines(shell.id);
    const maxOffset = Math.max(0, outputLines.length - this.maxOutputLines);
    this.scrollOffset = clamp(this.scrollOffset, 0, maxOffset);
    const shellIndexLabel = `${Math.max(1, shells.findIndex((s) => s.id === shell.id) + 1)}/${shells.length}`;
    const scrollLabel = this.scrollOffset === 0 ? "tail" : `-${this.scrollOffset}`;
    const focusLabel = this.isInputActive() ? `${ACTIVE}Alt+S:editor` : `${MUTED}Alt+S:shell`;
    const statusIcon = shell.status === "running" ? "●" : shell.status === "starting" ? "○" : "×";
    lines.push(fit(`${HEADER}${statusIcon} ${shell.command}${args} ${MUTED}${shellIndexLabel} ${scrollLabel}  ${focusLabel}${RESET}`, safeWidth));

    if (outputLines.length === 0) {
      lines.push(fit(`${MUTED}(empty shell output)${RESET}`, safeWidth));
      return lines;
    }
    for (const line of visibleWindow(outputLines, this.maxOutputLines, this.scrollOffset)) {
      lines.push(fit(line, safeWidth));
    }
    return lines;
  }

  invalidate() {}

  getSelectedShell() {
    if (!this.shellRuntime) return null;
    const shells = this.getShells();
    if (!shells.length) {
      this.selectedShellId = null;
      return null;
    }
    const selected = shells.find((shell) => shell.id === this.selectedShellId);
    if (selected) return selected;
    const running = shells.findLast?.((shell) => shell.status === "running" || shell.status === "starting");
    const fallback = running ?? shells.at(-1);
    this.selectedShellId = fallback.id;
    return fallback;
  }

  getShells() {
    return this.shellRuntime?.listShells?.() ?? [];
  }

  getOutputLines(shellId = this.getSelectedShell()?.id) {
    if (!shellId || !this.shellRuntime) return [];
    const snapshot = this.shellRuntime.snapshotShell(shellId);
    return formatAnsiLines(snapshot);
  }

  syncShellSize(shellId, cols, rows) {
    if (!shellId || !this.shellRuntime?.resizeShell) return null;
    const size = {
      cols: Math.max(1, Math.trunc(cols)),
      rows: Math.max(1, Math.trunc(rows)),
    };
    const previous = this.shellSizes.get(shellId);
    if (previous?.cols === size.cols && previous?.rows === size.rows) return null;
    this.shellSizes.set(shellId, size);
    return this.shellRuntime.resizeShell(shellId, {
      cols: size.cols,
      rows: size.rows,
    });
  }
}

export function formatAnsiLines(snapshot) {
  const screen = snapshot?.screen;
  const text = screen ? (screen.ansi || screen.plain || "") : (snapshot?.ansi || snapshot?.plain || "");
  const lines = sanitizeAnsiForDrawer(text)
    .replace(/\r/g, "")
    .split("\n");
  return screen ? trimTrailingEmptyLines(lines) : lines.filter((line) => line.length > 0);
}

export function sanitizeAnsiForDrawer(text) {
  return String(text ?? "").replace(CONTROL_RE, "");
}

function fit(text, width) {
  if (visibleWidth(text) <= width) return text;
  return truncateToWidth(text, width);
}

function visibleWindow(lines, size, offset) {
  const end = Math.max(0, lines.length - offset);
  const start = Math.max(0, end - size);
  return lines.slice(start, end);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function trimTrailingEmptyLines(lines) {
  let end = lines.length;
  while (end > 0 && lines[end - 1] === "") end -= 1;
  return lines.slice(0, end);
}
