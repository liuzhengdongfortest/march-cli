import { marked } from "marked";
import { visibleWidth } from "@mariozechner/pi-tui";
import { R, brightBlack, dim, orange, softGreen, bold, cyan } from "./ui-theme.mjs";

const TABLE_GAP = "  ";

export function renderMarkdown(markdown, width) {
  const maxWidth = Math.max(1, width);
  let tokens;
  try {
    tokens = marked.lexer(String(markdown ?? ""));
  } catch {
    return renderPlainMarkdownFallback(markdown, maxWidth);
  }
  const lines = [];
  for (const token of tokens) renderBlock(token, lines, maxWidth, 0);
  return lines.length ? lines : [""];
}

function renderBlock(token, lines, width, depth) {
  if (!token) return;
  if (token.type === "space") {
    if (lines.length && lines.at(-1) !== "") lines.push("");
    return;
  }
  if (token.type === "heading") {
    if (lines.length && lines.at(-1) !== "") lines.push("");
    appendWrappedRuns(lines, inlineRuns(token.tokens ?? [{ type: "text", text: token.text }], "heading"), width, 0);
    return;
  }
  if (token.type === "paragraph" || token.type === "text") {
    appendWrappedRuns(lines, inlineRuns(token.tokens ?? [{ type: "text", text: token.text }]), width, depth * 2);
    return;
  }
  if (token.type === "list") return renderList(token, lines, width, depth);
  if (token.type === "table") return renderTable(token, lines, width);
  if (token.type === "blockquote") return renderBlockquote(token, lines, width, depth);
  if (token.type === "code") return renderCode(token, lines, width);
  if (token.type === "hr") {
    lines.push(brightBlack("─".repeat(Math.min(width, 60))));
    return;
  }
  appendWrappedRuns(lines, [{ text: token.raw ?? token.text ?? "", style: null }], width, depth * 2);
}

function renderList(token, lines, width, depth) {
  token.items?.forEach((item, index) => {
    const marker = token.ordered ? `${Number(token.start || 1) + index}.` : "•";
    const prefix = `${"  ".repeat(depth)}${cyan(marker)} `;
    const textTokens = item.tokens?.filter((t) => t.type === "text") ?? [];
    const nested = item.tokens?.filter((t) => t.type === "list") ?? [];
    const runs = textTokens.length
      ? textTokens.flatMap((t) => inlineRuns(t.tokens ?? [{ type: "text", text: t.text }]))
      : inlineRuns([{ type: "text", text: item.text ?? "" }]);
    appendWrappedRuns(lines, runs, width, visibleWidth(stripAnsi(prefix)), prefix);
    for (const child of nested) renderList(child, lines, width, depth + 1);
  });
}

function renderTable(token, lines, width) {
  const rows = [token.header ?? [], ...(token.rows ?? [])];
  if (!rows.length) return;
  const cells = rows.map((row) => row.map((cell) => plainInline(cell.tokens ?? [{ type: "text", text: cell.text }])));
  const columnCount = Math.max(...cells.map((row) => row.length));
  const widths = Array.from({ length: columnCount }, (_, i) => Math.max(3, ...cells.map((row) => visibleWidth(row[i] ?? ""))));
  const totalGap = TABLE_GAP.length * Math.max(0, columnCount - 1);
  const maxTableWidth = Math.max(1, width - totalGap);
  shrinkColumns(widths, maxTableWidth);

  lines.push(formatTableRow(cells[0], widths, true));
  lines.push(brightBlack(widths.map((w) => "─".repeat(w)).join(TABLE_GAP)));
  for (const row of cells.slice(1)) lines.push(formatTableRow(row, widths, false));
}

function renderBlockquote(token, lines, width, depth) {
  const inner = [];
  for (const child of token.tokens ?? []) renderBlock(child, inner, Math.max(1, width - 2), depth);
  for (const line of inner) lines.push(`${brightBlack("│")} ${dim(line)}`);
}

function renderCode(token, lines, width) {
  const label = token.lang ? brightBlack(token.lang) : "";
  if (label) lines.push(label);
  for (const line of String(token.text ?? "").split("\n")) {
    for (const wrapped of wrapAnsi(softGreen(line), width)) lines.push(wrapped);
  }
}

function inlineRuns(tokens, forcedStyle = null) {
  const runs = [];
  for (const token of tokens ?? []) {
    if (token.type === "strong") runs.push(...inlineRuns(token.tokens, "strong"));
    else if (token.type === "em") runs.push(...inlineRuns(token.tokens, "em"));
    else if (token.type === "codespan") runs.push({ text: token.text ?? "", style: "code" });
    else if (token.type === "link") runs.push(...inlineRuns(token.tokens ?? [{ type: "text", text: token.text }], "link"));
    else runs.push({ text: token.text ?? token.raw ?? "", style: forcedStyle });
  }
  return runs;
}

function appendWrappedRuns(lines, runs, width, indent = 0, firstPrefix = null) {
  const prefix = firstPrefix ?? " ".repeat(indent);
  const restPrefix = " ".repeat(indent);
  let current = prefix;
  let currentWidth = visibleWidth(stripAnsi(prefix));
  const maxWidth = Math.max(1, width);
  for (const run of runs) {
    for (const ch of run.text) {
      const charWidth = visibleWidth(ch);
      if (currentWidth + charWidth > maxWidth && currentWidth > visibleWidth(stripAnsi(prefix))) {
        lines.push(current);
        current = restPrefix;
        currentWidth = visibleWidth(restPrefix);
      }
      current += styleText(ch, run.style);
      currentWidth += charWidth;
    }
  }
  lines.push(current);
}

function styleText(text, style) {
  if (!style) return text;
  if (style === "heading" || style === "strong") return orange(text);
  if (style === "code") return softGreen(text);
  if (style === "em") return dim(text);
  if (style === "link") return cyan(text);
  return text;
}

function plainInline(tokens) {
  return stripAnsi(inlineRuns(tokens).map((run) => run.text).join(""));
}

function formatTableRow(row, widths, header) {
  return widths.map((width, i) => {
    const text = truncateCell(row[i] ?? "", width);
    const padded = text + " ".repeat(Math.max(0, width - visibleWidth(text)));
    return header ? bold(padded) : padded;
  }).join(TABLE_GAP);
}

function shrinkColumns(widths, maxTotal) {
  while (widths.reduce((a, b) => a + b, 0) > maxTotal && Math.max(...widths) > 6) {
    const index = widths.indexOf(Math.max(...widths));
    widths[index] -= 1;
  }
}

function truncateCell(text, width) {
  let out = "";
  let used = 0;
  for (const ch of text) {
    const w = visibleWidth(ch);
    if (used + w > width) break;
    out += ch;
    used += w;
  }
  if (out.length < text.length && width > 1) return out.slice(0, Math.max(0, out.length - 1)) + "…";
  return out;
}

function renderPlainMarkdownFallback(markdown, width) {
  return String(markdown ?? "").split("\n").flatMap((line) => wrapAnsi(line, width));
}

function wrapAnsi(text, maxWidth) {
  if (maxWidth <= 0) return [""];
  const result = [];
  let cur = "";
  let curW = 0;
  let activeSgr = "";
  for (let i = 0; i < text.length;) {
    if (text[i] === "\x1b") {
      const match = text.slice(i).match(/^\x1b\[[0-?]*[ -/]*[@-~]/);
      if (match) {
        const seq = match[0];
        cur += seq;
        activeSgr = updateActiveSgr(activeSgr, seq);
        i += seq.length;
        continue;
      }
    }
    const ch = text[i];
    const w = visibleWidth(ch);
    if (curW + w > maxWidth) {
      result.push(activeSgr ? `${cur}${R}` : cur);
      cur = activeSgr + ch;
      curW = w;
    } else {
      cur += ch;
      curW += w;
    }
    i += 1;
  }
  if (cur) result.push(cur);
  return result.length ? result : [""];
}

function updateActiveSgr(activeSgr, seq) {
  if (!seq.endsWith("m")) return activeSgr;
  const body = seq.slice(2, -1);
  if (body === "" || body.split(";").includes("0")) return "";
  return seq;
}

function stripAnsi(text) {
  return String(text ?? "").replace(/\x1b(?:\][^\x07]*(?:\x07|\x1b\\)|[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "");
}
