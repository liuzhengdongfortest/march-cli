import { visibleWidth } from "@earendil-works/pi-tui";
import { marked } from "marked";
import { renderMarkdown } from "../markdown-renderer.mjs";
import { sliceColumns } from "../selection/ansi-range.mjs";

export function appendSelectableEntries(entries, block, lines, width) {
  if (block.type !== "markdown") {
    for (const line of lines) entries.push({ line, source: null, codeSource: null, block, baseRow: entries.length });
    return;
  }
  const source = { kind: "markdown", text: block.text, startRow: entries.length, endRow: entries.length + lines.length - 1 };
  const fragmentRanges = renderedFragmentRanges(block.text, width, entries.length);
  for (const line of lines) {
    const baseRow = entries.length;
    const fragmentSource = fragmentRanges.find((range) => baseRow >= range.startRow && baseRow <= range.endRow) ?? null;
    const codeSource = fragmentSource?.kind === "code" ? fragmentSource : null;
    const codeSlice = codeSource?.lineMap.get(baseRow) ?? null;
    entries.push({ line, source, codeSource, codeSlice, fragmentSource, baseRow });
  }
}

export function sliceEntriesWithTail(baseEntries, tailLine, range) {
  if (!range) return tailLine == null ? baseEntries : [...baseEntries, { line: tailLine, source: null, codeSource: null, block: null, baseRow: baseEntries.length }];
  const { start, end } = range;
  const visible = baseEntries.slice(start, Math.min(end, baseEntries.length));
  if (tailLine != null && end > baseEntries.length) visible.push({ line: tailLine, source: null, codeSource: null, block: null, baseRow: baseEntries.length });
  return visible;
}

export function copySourceTextForRange(entries, range) {
  if (!range) return "";
  const selected = trimEmptyBoundaryEntries(entries.slice(range.start.row, range.end.row + 1));
  const codeText = copyCompleteCodeSource(selected, entries, range);
  if (codeText) return codeText;
  const codeFragmentText = copyCodeSourceFragment(selected, range);
  if (codeFragmentText) return codeFragmentText;
  const fragmentText = copyCompleteFragmentSource(selected, entries, range);
  if (fragmentText) return fragmentText;
  if (!selected.length || selected.some((entry) => !entry.source)) return "";
  const sources = uniqueSources(selected, "source");
  if (!sources.length || !sources.every((source) => sourceIsFullySelected(source, entries, range, "source"))) return "";
  return sources.map((source) => source.text).join("\n\n");
}

function trimEmptyBoundaryEntries(entries) {
  let start = 0;
  let end = entries.length;
  while (start < end && !entries[start].source && stripAnsi(entries[start].line).trim() === "") start += 1;
  while (end > start && !entries[end - 1].source && stripAnsi(entries[end - 1].line).trim() === "") end -= 1;
  return entries.slice(start, end);
}

function uniqueSources(entries, key) {
  const result = [];
  for (const entry of entries) {
    const source = entry[key];
    if (!source || result.includes(source)) continue;
    result.push(source);
  }
  return result;
}

function copyCompleteCodeSource(selected, entries, range) {
  if (!selected.length || selected.some((entry) => !entry.codeSource)) return "";
  const sources = uniqueSources(selected, "codeSource");
  if (sources.length !== 1 || !sourceIsFullySelected(sources[0], entries, range, "codeSource")) return "";
  return sources[0].text;
}

function copyCompleteFragmentSource(selected, entries, range) {
  if (!selected.length || selected.some((entry) => !entry.fragmentSource)) return "";
  const sources = uniqueSources(selected, "fragmentSource");
  if (sources.length !== 1 || !sourceIsFullySelected(sources[0], entries, range, "fragmentSource")) return "";
  return sources[0].text;
}

function copyCodeSourceFragment(selected, range) {
  const sources = uniqueSources(selected, "codeSource");
  if (sources.length !== 1 || selected.some((entry) => entry.codeSource !== sources[0])) return "";
  const source = sources[0];
  const parts = [];
  let currentLine = null;
  let currentText = "";
  for (const entry of selected) {
    if (!entry.codeSlice) continue;
    const text = selectedCodeSliceText(source, entry, range);
    if (!text) continue;
    if (currentLine === entry.codeSlice.sourceLine) {
      currentText += text;
      continue;
    }
    if (currentLine != null) parts.push(currentText);
    currentLine = entry.codeSlice.sourceLine;
    currentText = text;
  }
  if (currentLine != null) parts.push(currentText);
  return parts.join("\n");
}

function selectedCodeSliceText(source, entry, range) {
  const slice = entry.codeSlice;
  const displayLine = stripAnsi(entry.line);
  const displayStart = entry.baseRow === range.start.row ? range.start.col : 0;
  const displayEnd = entry.baseRow === range.end.row ? range.end.col : visibleWidth(displayLine);
  const contentStart = Math.max(0, displayStart - source.contentColumn);
  const contentEnd = Math.min(slice.endCol - slice.startCol, Math.max(0, displayEnd - source.contentColumn));
  if (contentEnd <= contentStart) return "";
  const line = source.lines[slice.sourceLine] ?? "";
  return sliceColumns(line, slice.startCol + contentStart, slice.startCol + contentEnd);
}

function sourceIsFullySelected(source, entries, range, key) {
  const startIndex = entries.findIndex((entry) => entry[key] === source && entry.baseRow === source.startRow);
  const endIndex = entries.findLastIndex((entry) => entry[key] === source && entry.baseRow === source.endRow);
  if (startIndex < 0 || endIndex < 0) return false;
  if (range.start.row > startIndex || range.end.row < endIndex) return false;
  const lastLine = stripAnsi(entries[endIndex]?.line ?? "");
  const coversStart = range.start.row < startIndex || range.start.col <= 0;
  const coversEnd = range.end.row > endIndex || range.end.col >= visibleWidth(lastLine);
  return coversStart && coversEnd;
}

function renderedFragmentRanges(markdown, width, baseRow) {
  let tokens = [];
  try { tokens = marked.lexer(String(markdown ?? "")); } catch { return []; }
  let row = baseRow;
  const ranges = [];
  for (const token of tokens) {
    const raw = token.raw ?? token.text ?? "";
    const lineCount = renderMarkdown(raw, width).length;
    const range = sourceRangeForToken(token, raw, row, lineCount, width);
    if (range) ranges.push(range);
    row += lineCount;
  }
  return ranges;
}

function sourceRangeForToken(token, raw, row, lineCount, width) {
  if (token.type === "code") return codeSourceRange(token, row, lineCount, width);
  if (token.type === "table") return { kind: "table", text: String(raw).trimEnd(), startRow: row, endRow: row + lineCount - 1 };
  return null;
}

function codeSourceRange(token, row, lineCount, width) {
  const text = String(token.text ?? "");
  const innerWidth = Math.max(1, width - 4);
  return {
    kind: "code",
    text,
    lines: text.split("\n"),
    contentColumn: 2,
    lineMap: codeLineMap(text, row + 1, innerWidth),
    startRow: row,
    endRow: row + lineCount - 1,
  };
}


function codeLineMap(text, firstContentRow, innerWidth) {
  const map = new Map();
  let row = firstContentRow;
  String(text ?? "").split("\n").forEach((line, sourceLine) => {
    for (const slice of wrapSourceLine(line, innerWidth)) {
      map.set(row, { sourceLine, startCol: slice.startCol, endCol: slice.endCol });
      row += 1;
    }
  });
  return map;
}

function wrapSourceLine(line, maxWidth) {
  if (!line) return [{ startCol: 0, endCol: 0 }];
  const result = [];
  let startCol = 0;
  let width = 0;
  let col = 0;
  for (const ch of String(line)) {
    const charWidth = visibleWidth(ch);
    if (width + charWidth > maxWidth && col > startCol) {
      result.push({ startCol, endCol: col });
      startCol = col;
      width = 0;
    }
    width += charWidth;
    col += charWidth;
  }
  result.push({ startCol, endCol: col });
  return result;
}

function stripAnsi(text) {
  return String(text ?? "").replace(/\x1b(?:\][^\x07]*(?:\x07|\x1b\\)|\[[0-?]*[ -/]*[@-~]|[@-Z\\-_])/g, "");
}
