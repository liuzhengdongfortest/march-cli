import { visibleWidth } from "@earendil-works/pi-tui";

const CONTROL_RE = /\x1b(?:\][^\x07]*(?:\x07|\x1b\\)|\[[0-?]*[ -/]*[@-~]|[@-Z\\-_])/g;
const INVERSE = "\x1b[7m";
const RESET = "\x1b[0m";

export class ScreenSelection {
  constructor() {
    this.active = false;
    this.anchor = null;
    this.focus = null;
    this.lines = [];
  }

  setLines(lines) {
    this.lines = lines.map((line) => stripAnsi(line));
  }

  start(point) {
    this.active = true;
    this.anchor = normalizePoint(point);
    this.focus = this.anchor;
  }

  update(point) {
    if (!this.active || !this.anchor) return false;
    this.focus = normalizePoint(point);
    return true;
  }

  finish(point) {
    if (!this.active || !this.anchor) return "";
    this.focus = normalizePoint(point);
    const text = this.text();
    this.clear();
    return text;
  }

  clear() {
    const hadSelection = this.active || Boolean(this.anchor || this.focus);
    this.active = false;
    this.anchor = null;
    this.focus = null;
    return hadSelection;
  }

  text() {
    const range = this.range();
    if (!range) return "";
    const selected = [];
    for (let row = range.start.row; row <= range.end.row; row += 1) {
      const line = this.lines[row] ?? "";
      const startCol = row === range.start.row ? range.start.col : 0;
      const endCol = row === range.end.row ? range.end.col : visibleWidth(line);
      selected.push(sliceColumns(line, startCol, endCol));
    }
    return selected.join("\n").replace(/[ \t]+$/gm, "").trimEnd();
  }

  apply(lines) {
    const range = this.range();
    if (!range) return lines;
    return lines.map((line, row) => {
      if (row < range.start.row || row > range.end.row) return line;
      const plain = stripAnsi(line);
      const startCol = row === range.start.row ? range.start.col : 0;
      const endCol = row === range.end.row ? range.end.col : visibleWidth(plain);
      if (endCol <= startCol) return line;
      return highlightPlainLine(plain, startCol, endCol);
    });
  }

  range() {
    if (!this.anchor || !this.focus) return null;
    const [start, end] = comparePoints(this.anchor, this.focus) <= 0
      ? [this.anchor, this.focus]
      : [this.focus, this.anchor];
    if (start.row === end.row && start.col === end.col) return null;
    return { start, end };
  }
}

export function stripAnsi(text) {
  return String(text ?? "").replace(CONTROL_RE, "");
}

function normalizePoint({ row, col }) {
  return {
    row: Math.max(0, Math.trunc(row) - 1),
    col: Math.max(0, Math.trunc(col) - 1),
  };
}

function comparePoints(a, b) {
  if (a.row !== b.row) return a.row - b.row;
  return a.col - b.col;
}

function highlightPlainLine(line, startCol, endCol) {
  const before = sliceColumns(line, 0, startCol);
  const selected = sliceColumns(line, startCol, endCol);
  const after = sliceColumns(line, endCol, visibleWidth(line));
  return `${before}${INVERSE}${selected}${RESET}${after}`;
}

function sliceColumns(text, startCol, endCol) {
  let col = 0;
  let result = "";
  for (const ch of String(text ?? "")) {
    const next = col + visibleWidth(ch);
    if (next > startCol && col < endCol) result += ch;
    col = next;
    if (col >= endCol) break;
  }
  return result;
}
