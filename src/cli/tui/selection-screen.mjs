import { visibleWidth } from "@earendil-works/pi-tui";

const CONTROL_RE = /\x1b(?:\][^\x07]*(?:\x07|\x1b\\)|\[[0-?]*[ -/]*[@-~]|[@-Z\\-_])/g;
const INVERSE = "\x1b[7m";
const RESET = "\x1b[0m";

export class ScreenSelection {
  constructor() {
    this.active = false;
    this.anchor = null;
    this.focus = null;
    this.regions = [];
    this._plainLines = new Map();
    this.viewport = { topRow: 0, leftCol: 0, width: Infinity, height: 0 };
  }

  setLines(lines) {
    this.setViewport({ topRow: 0, leftCol: 0, width: Infinity, lines });
  }

  setViewport({ topRow = 0, leftCol = 0, width = Infinity, lines = [] } = {}) {
    this.setRegions([{ id: "default", topRow, leftCol, width, lines }]);
  }

  setRegions(regions = []) {
    let docRow = 0;
    this.regions = regions
      .map((region, index) => normalizeRegion(region, index))
      .filter((region) => region.lines.length > 0)
      .sort((a, b) => a.topRow - b.topRow || a.leftCol - b.leftCol)
      .map((region) => {
        const normalized = { ...region, docStart: docRow };
        docRow += region.lines.length;
        return normalized;
      });
    this.lines = this.regions.flatMap((region) => region.lines);
    this._plainLines = new Map();
    this.viewport = { topRow: 0, leftCol: 0, width: Infinity, height: this.lines.length };
  }

  start(point) {
    const normalized = normalizePoint(point, this.regions, true);
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
    this.focus = normalizePoint(point, this.regions, true) ?? this.focus;
    return true;
  }

  finish(point, { clear = true } = {}) {
    if (!this.active || !this.anchor) return "";
    this.focus = normalizePoint(point, this.regions, true) ?? this.focus;
    const text = this.text();
    if (clear) this.clear();
    else this.active = false;
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
      const line = this._plainLine(row);
      const startCol = row === range.start.row ? range.start.col : 0;
      const endCol = row === range.end.row ? range.end.col : visibleWidth(line);
      selected.push(sliceColumns(line, startCol, endCol));
    }
    return selected.join("\n").replace(/[ \t]+$/gm, "").trimEnd();
  }

  apply(lines) {
    return this.applyRegion("default", lines);
  }

  applyRegion(id, lines) {
    const range = this.range();
    const region = this.regions.find((candidate) => candidate.id === id);
    if (!range || !region) return lines;
    return lines.map((line, row) => {
      const docRow = region.docStart + row;
      if (docRow < range.start.row || docRow > range.end.row) return line;
      const plain = this._plainLine(docRow);
      const startCol = docRow === range.start.row ? range.start.col : 0;
      const endCol = docRow === range.end.row ? range.end.col : visibleWidth(plain);
      if (endCol <= startCol) return line;
      return highlightAnsiLine(line, startCol, endCol);
    });
  }

  _plainLine(row) {
    if (!this._plainLines.has(row)) this._plainLines.set(row, stripAnsi(this.lines[row] ?? ""));
    return this._plainLines.get(row);
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

function normalizeRegion(region, index) {
  const lines = [...(region.lines ?? [])];
  const width = Number.isFinite(region.width) ? Math.max(1, Math.trunc(region.width)) : Infinity;
  return {
    id: region.id ?? `region-${index}`,
    lines,
    topRow: Math.max(0, Math.trunc(region.topRow ?? 0)),
    leftCol: Math.max(0, Math.trunc(region.leftCol ?? 0)),
    width,
  };
}

function normalizePoint({ row, col }, regions, clamp) {
  const screenRow = Math.trunc(row) - 1;
  const screenCol = Math.trunc(col) - 1;
  if (regions.length === 0) return null;

  for (const region of regions) {
    const localRow = screenRow - region.topRow;
    const localCol = screenCol - region.leftCol;
    const maxCol = Number.isFinite(region.width) ? region.width : Infinity;
    if (localRow >= 0 && localRow < region.lines.length) {
      if (!clamp && (localCol < 0 || localCol > maxCol)) return null;
      return {
        row: region.docStart + localRow,
        col: clampNumber(localCol, 0, maxCol),
      };
    }
  }

  if (!clamp) return null;
  const first = regions[0];
  const last = regions.at(-1);
  if (screenRow < first.topRow) return { row: first.docStart, col: 0 };
  if (screenRow > last.topRow + last.lines.length - 1) {
    return { row: last.docStart + last.lines.length - 1, col: last.width };
  }

  let nearest = null;
  for (const region of regions) {
    const beforeDistance = Math.abs(screenRow - region.topRow);
    const afterDistance = Math.abs(screenRow - (region.topRow + region.lines.length - 1));
    const before = { row: region.docStart, col: 0, distance: beforeDistance };
    const after = { row: region.docStart + region.lines.length - 1, col: region.width, distance: afterDistance };
    for (const candidate of [before, after]) {
      if (!nearest || candidate.distance < nearest.distance) nearest = candidate;
    }
  }
  return nearest ? { row: nearest.row, col: nearest.col } : null;
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
