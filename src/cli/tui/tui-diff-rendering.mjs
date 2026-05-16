import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { bold, dim, red, green, brightBlack } from "./ui-theme.mjs";
import { highlightCodeLine, styleSyntax } from "./syntax/highlighting.mjs";

const SPLIT_DIFF_MIN_WIDTH = 121;
const BG_DEL = "48;2;55;34;44";
const BG_ADD = "48;2;32;48;59";
const BG_CTX = "";

export function writeEditDiff({ output, path, diffLines }) {
  const lines = formatEditDiffLines({ path, diffLines });
  if (typeof output.addBlock === "function") output.addBlock({ type: "diff", path, diffLines, lines });
  else for (const line of lines) output.writeln(line);
}

export function renderEditDiffBlock(block, width) {
  return formatEditDiffLines({ path: block.path, diffLines: block.diffLines ?? [], width });
}

export function formatEditDiffLines({ path, diffLines, width = 0 }) {
  if (width >= SPLIT_DIFF_MIN_WIDTH) return formatSplitDiffLines({ path, diffLines, width });
  return formatUnifiedDiffLines({ path, diffLines });
}

function formatUnifiedDiffLines({ path, diffLines }) {
  const counts = countChanges(diffLines);
  const summary = [`± ${path}`];
  if (counts.del > 0) summary.push(red(`${counts.del}-`));
  if (counts.add > 0) summary.push(green(`${counts.add}+`));

  const lines = [bold(summary.join("  "))];
  const gutterWidth = maxLineNumber(diffLines);
  for (const line of diffLines) {
    const num = line.lineNum != null ? String(line.lineNum).padStart(gutterWidth) : " ".repeat(gutterWidth);
    if (line.type === "del") lines.push(formatUnifiedSide({ num, sign: "-", text: line.text, type: "del", path }));
    else if (line.type === "add") lines.push(formatUnifiedSide({ num, sign: "+", text: line.text, type: "add", path }));
    else lines.push(`${brightBlack(`${num} │`)} ${dim(`  ${line.text}`)}`);
  }
  return lines;
}

function formatSplitDiffLines({ path, diffLines, width }) {
  const rows = pairDiffRows(diffLines);
  const counts = countChanges(diffLines);
  const summary = [`± ${path}`];
  if (counts.del > 0) summary.push(red(`${counts.del}-`));
  if (counts.add > 0) summary.push(green(`${counts.add}+`));

  const gutterWidth = maxLineNumber(diffLines);
  const sep = brightBlack(" │ ");
  const sepWidth = 3;
  const sideWidth = Math.floor((width - sepWidth) / 2);
  if (sideWidth < gutterWidth + 12) return formatUnifiedDiffLines({ path, diffLines });

  const lines = [bold(summary.join("  "))];
  for (const row of rows) {
    const left = formatSplitSide({ side: row.left, sideWidth, gutterWidth, path, fallbackType: row.type });
    const right = formatSplitSide({ side: row.right, sideWidth: width - sepWidth - sideWidth, gutterWidth, path, fallbackType: row.type });
    lines.push(`${left}${sep}${right}`);
  }
  return lines;
}

function formatUnifiedSide({ num, sign, text, type, path }) {
  const bg = type === "del" ? BG_DEL : BG_ADD;
  const signScope = type === "del" ? "comment" : "string";
  return `${stylePlain(`${num} │ `, "90", bg)}${styleSyntax(`${sign} `, signScope, bg)}${highlightCodeLine(text, path, { bg })}`;
}

function formatSplitSide({ side, sideWidth, gutterWidth, path, fallbackType }) {
  if (!side) return formatEmptySplitSide({ sideWidth, gutterWidth });
  const type = side.type ?? fallbackType;
  const bg = type === "del" ? BG_DEL : type === "add" ? BG_ADD : BG_CTX;
  const sign = type === "del" ? "-" : type === "add" ? "+" : " ";
  const signScope = type === "del" ? "comment" : type === "add" ? "string" : "default";
  const num = side.lineNum != null ? String(side.lineNum).padStart(gutterWidth) : " ".repeat(gutterWidth);
  const line = [
    stylePlain(`${num} │ `, "90", bg),
    styleSyntax(`${sign} `, signScope, bg),
    highlightCodeLine(side.text ?? "", path, { bg }),
  ].join("");
  return fitAnsiToWidth(line, sideWidth, bg);
}

function formatEmptySplitSide({ sideWidth, gutterWidth }) {
  const line = [
    stylePlain(`${" ".repeat(gutterWidth)} │ `, "90", ""),
    styleSyntax("  ", "default", ""),
  ].join("");
  return fitAnsiToWidth(line, sideWidth, "");
}

function fitAnsiToWidth(text, width, bg = "") {
  const fitted = truncateToWidth(String(text ?? ""), width, "…", false);
  const padding = Math.max(0, width - visibleWidth(fitted));
  return `${fitted}${stylePlain(" ".repeat(padding), "", bg)}`;
}

function pairDiffRows(lines) {
  const rows = [];
  for (let i = 0; i < lines.length;) {
    const line = lines[i];
    if (line.type === "ctx") {
      rows.push({ type: "ctx", left: line, right: line });
      i++;
      continue;
    }

    if (line.type === "del") {
      const del = [];
      while (i < lines.length && lines[i].type === "del") del.push(lines[i++]);
      const add = [];
      while (i < lines.length && lines[i].type === "add") add.push(lines[i++]);
      const max = Math.max(del.length, add.length);
      for (let n = 0; n < max; n++) rows.push({ type: del[n] && add[n] ? "mod" : del[n] ? "del" : "add", left: del[n], right: add[n] });
      continue;
    }

    if (line.type === "add") {
      rows.push({ type: "add", left: null, right: line });
      i++;
      continue;
    }

    i++;
  }
  return rows;
}

function countChanges(lines) {
  let del = 0; let add = 0;
  for (const line of lines) {
    if (line.type === "del") del += 1;
    if (line.type === "add") add += 1;
  }
  return { del, add };
}

function maxLineNumber(lines) {
  let max = 0;
  for (const line of lines) {
    if (line.lineNum != null && line.lineNum > max) max = line.lineNum;
  }
  return max > 0 ? String(max).length : 1;
}

function stylePlain(text, fg = "", bg = "") {
  const plain = stripAnsi(String(text ?? ""));
  const codes = [];
  if (fg) codes.push(fg);
  if (bg) codes.push(bg);
  return codes.length ? `\x1b[${codes.join(";")}m${plain}\x1b[0m` : plain;
}

function stripAnsi(text) {
  return String(text ?? "").replace(/\x1b(?:\][^\x07]*(?:\x07|\x1b\\)|[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "");
}
