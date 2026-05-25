import { visibleWidth } from "@earendil-works/pi-tui";

const INVERSE = "\x1b[7m";
const RESET = "\x1b[0m";

export function highlightAnsiLine(line, startCol, endCol) {
  const { before, selected, after, activeAtStart, activeAtEnd } = splitAnsiColumns(line, startCol, endCol);
  return `${before}${INVERSE}${activeAtStart}${keepInverseAfterReset(selected)}${RESET}${activeAtEnd}${after}`;
}

export function sliceColumns(text, startCol, endCol) {
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

function keepInverseAfterReset(text) {
  return String(text ?? "").replace(/\x1b\[([0-9;]*)m/g, (seq, body) => {
    const params = body === "" ? ["0"] : body.split(";");
    return params.includes("0") ? `${seq}${INVERSE}` : seq;
  });
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
