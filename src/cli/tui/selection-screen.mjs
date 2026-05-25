import { visibleWidth } from "@earendil-works/pi-tui";
import { highlightAnsiLine, sliceColumns } from "./selection/ansi-range.mjs";

const CONTROL_RE = /\x1b(?:\][^\x07]*(?:\x07|\x1b\\)|\[[0-?]*[ -/]*[@-~]|[@-Z\\-_])/g;

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

  copyText() {
    const sourceText = this.sourceText();
    return sourceText || this.text();
  }

  sourceText() {
    const range = this.range();
    if (!range) return "";
    const region = this._singleRegionForRange(range);
    if (!region?.copyText) return "";
    return region.copyText(localRange(range, region)) || "";
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

  hitTest(point) {
    const hit = hitRegion(point, this.regions);
    if (!hit) return null;
    return { regionId: hit.region.id, row: hit.localRow, col: hit.localCol };
  }

  _plainLine(row) {
    if (!this._plainLines.has(row)) this._plainLines.set(row, stripAnsi(this.lines[row] ?? ""));
    return this._plainLines.get(row);
  }

  _singleRegionForRange(range) {
    const matches = this.regions.filter((region) => {
      const start = region.docStart;
      const end = region.docStart + region.lines.length - 1;
      return range.start.row >= start && range.end.row <= end;
    });
    return matches.length === 1 ? matches[0] : null;
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
    copyText: typeof region.copyText === "function" ? region.copyText : null,
  };
}

function localRange(range, region) {
  return {
    start: { row: range.start.row - region.docStart, col: range.start.col },
    end: { row: range.end.row - region.docStart, col: range.end.col },
  };
}

function normalizePoint({ row, col }, regions, clamp) {
  const hit = hitRegion({ row, col }, regions);
  if (hit) {
    const maxCol = Number.isFinite(hit.region.width) ? hit.region.width : Infinity;
    return {
      row: hit.region.docStart + hit.localRow,
      col: clampNumber(hit.localCol, 0, maxCol),
    };
  }
  if (!clamp) return null;

  const screenRow = Math.trunc(row) - 1;
  if (regions.length === 0) return null;

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

function hitRegion({ row, col }, regions) {
  const screenRow = Math.trunc(row) - 1;
  const screenCol = Math.trunc(col) - 1;
  for (const region of regions) {
    const localRow = screenRow - region.topRow;
    const localCol = screenCol - region.leftCol;
    const maxCol = Number.isFinite(region.width) ? region.width : Infinity;
    if (localRow < 0 || localRow >= region.lines.length) continue;
    if (localCol < 0 || localCol > maxCol) continue;
    return { region, localRow, localCol };
  }
  return null;
}

function comparePoints(a, b) {
  if (a.row !== b.row) return a.row - b.row;
  return a.col - b.col;
}



function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
