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
    this.viewport = { topRow: 0, leftCol: 0, width: Infinity, height: 0 };
  }

  setLines(lines) {
    this.lines = lines.map((line) => stripAnsi(line));
    this.viewport = { topRow: 0, leftCol: 0, width: Infinity, height: this.lines.length };
  }

  setViewport({ topRow = 0, leftCol = 0, width = Infinity, lines = [] } = {}) {
    this.lines = lines.map((line) => stripAnsi(line));
    this.viewport = {
      topRow: Math.max(0, Math.trunc(topRow)),
      leftCol: Math.max(0, Math.trunc(leftCol)),
      width: Number.isFinite(width) ? Math.max(1, Math.trunc(width)) : Infinity,
      height: this.lines.length,
    };
  }

  start(point) {
    const normalized = normalizePoint(point, this.viewport, true);
    if (!normalized) {
      this.clear();
      return false;
    }
    this.active = true;
    this.anchor = normalized;
    this.focus = this.anchor;
    return true;
  }

  update(point) {
    if (!this.active || !this.anchor) return false;
    this.focus = normalizePoint(point, this.viewport, true) ?? this.focus;
    return true;
  }

  finish(point) {
    if (!this.active || !this.anchor) return "";
    this.focus = normalizePoint(point, this.viewport, true) ?? this.focus;
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
      return highlightAnsiLine(line, startCol, endCol);
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

function normalizePoint({ row, col }, viewport, clamp) {
  const screenRow = Math.trunc(row) - 1;
  const screenCol = Math.trunc(col) - 1;
  const height = viewport?.height ?? 0;
  if (height <= 0) return null;

  let localRow = screenRow - (viewport?.topRow ?? 0);
  let localCol = screenCol - (viewport?.leftCol ?? 0);
  const maxCol = Number.isFinite(viewport?.width) ? viewport.width : Infinity;
  if (!clamp && (localRow < 0 || localRow >= height || localCol < 0 || localCol > maxCol)) return null;
  localRow = clampNumber(localRow, 0, height - 1);
  localCol = clampNumber(localCol, 0, maxCol);
  return { row: localRow, col: localCol };
}

function comparePoints(a, b) {
  if (a.row !== b.row) return a.row - b.row;
  return a.col - b.col;
}

function highlightAnsiLine(line, startCol, endCol) {
  const { before, selected, after, activeAtStart, activeAtEnd } = splitAnsiColumns(line, startCol, endCol);
  return `${before}${INVERSE}${activeAtStart}${keepInverseAfterReset(selected)}${RESET}${activeAtEnd}${after}`;
}

function keepInverseAfterReset(text) {
  return String(text ?? "").replace(/\x1b\[([0-9;]*)m/g, (seq, body) => {
    const params = body === "" ? ["0"] : body.split(";");
    return params.includes("0") ? `${seq}${INVERSE}` : seq;
  });
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

function splitAnsiColumns(text, startCol, endCol) {
  let col = 0;
  let i = 0;
  let before = "";
  let selected = "";
  let after = "";
  let active = "";
  let activeAtStart = "";
  let activeAtEnd = "";
  let capturedStart = false;
  let capturedEnd = false;
  const source = String(text ?? "");

  while (i < source.length) {
    const ansi = readAnsi(source, i);
    if (ansi) {
      active = updateActiveSgr(active, ansi);
      if (col < startCol) before += ansi;
      else if (col < endCol) selected += ansi;
      else after += ansi;
      i += ansi.length;
      continue;
    }

    const ch = source[i];
    if (!capturedStart && col >= startCol) {
      activeAtStart = active;
      capturedStart = true;
    }
    if (!capturedEnd && col >= endCol) {
      activeAtEnd = active;
      capturedEnd = true;
    }

    const next = col + visibleWidth(ch);
    if (next <= startCol) before += ch;
    else if (col >= endCol) after += ch;
    else selected += ch;
    col = next;
    i += 1;
  }

  if (!capturedStart) activeAtStart = active;
  if (!capturedEnd) activeAtEnd = active;
  return { before, selected, after, activeAtStart, activeAtEnd };
}

function readAnsi(text, offset) {
  if (text[offset] !== "\x1b") return null;
  const match = text.slice(offset).match(/^\x1b(?:\][^\x07]*(?:\x07|\x1b\\)|\[[0-?]*[ -/]*[@-~]|[@-Z\\-_])/);
  return match?.[0] ?? null;
}

function updateActiveSgr(active, seq) {
  if (!seq.startsWith("\x1b[") || !seq.endsWith("m")) return active;
  const body = seq.slice(2, -1);
  if (body === "" || body.split(";").includes("0")) return "";
  return seq;
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
