import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";

const HEADER_FG = "\x1b[38;5;250m";
const MUTED = "\x1b[90m";
const BORDER = "\x1b[38;5;238m";
const RESET = "\x1b[0m";

export class ShellDrawer {
  constructor({ shellRuntime = null, maxOutputLines = 10 } = {}) {
    this.shellRuntime = shellRuntime;
    this.maxOutputLines = maxOutputLines;
    this.visible = false;
    this.selectedShellId = null;
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
    return next;
  }

  render(width) {
    if (!this.visible) return [];
    const safeWidth = Math.max(1, width);
    const shell = this.getSelectedShell();
    const lines = [
      `${BORDER}${"─".repeat(Math.max(1, safeWidth))}${RESET}`,
    ];

    if (!this.shellRuntime) {
      lines.push(fit(`${MUTED}shell drawer: disabled (start with --shell-runtime)${RESET}`, safeWidth));
      return lines;
    }

    if (!shell) {
      lines.push(fit(`${MUTED}shell drawer: no shells${RESET}`, safeWidth));
      return lines;
    }

    const shells = this.getShells();
    const position = Math.max(0, shells.findIndex((item) => item.id === shell.id)) + 1;
    const args = shell.args?.length ? ` ${shell.args.join(" ")}` : "";
    lines.push(fit(`${HEADER_FG}${shell.name} ${MUTED}${position}/${shells.length} ${shell.id} ${shell.status} ${shell.command}${args}${RESET}`, safeWidth));

    const snapshot = this.shellRuntime.snapshotShell(shell.id);
    const outputLines = String(snapshot.plain || "")
      .split("\n")
      .filter((line) => line.length > 0)
      .slice(-this.maxOutputLines);
    if (outputLines.length === 0) {
      lines.push(fit(`${MUTED}(empty shell output)${RESET}`, safeWidth));
      return lines;
    }
    for (const line of outputLines) {
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
}

function fit(text, width) {
  if (visibleWidth(text) <= width) return text;
  return truncateToWidth(text, width);
}
