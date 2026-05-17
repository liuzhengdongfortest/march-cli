import { visibleWidth } from "@earendil-works/pi-tui";
import { R, brightBlack, dim, red } from "../ui-theme.mjs";

export function renderToolCardBlock(block, width) {
  const lines = [];
  const border = brightBlack("┃");
  const marker = block.state === "running" ? "▶" : block.expanded ? "▾" : "▸";
  const summary = block.summary ? ` · ${block.summary}` : "";
  const head = `${marker} ${block.title}${summary}`;
  appendCardWrapped(lines, border, (block.isError ? red : dim)(head), width);

  if (block.expanded && block.bodyLines?.length) {
    lines.push(border);
    for (const line of block.bodyLines) appendCardWrapped(lines, border, dim(line), width, "  ");
  }
  return lines;
}

function appendCardWrapped(lines, border, text, width, indent = "") {
  const prefix = `${border} ${indent}`;
  const contentWidth = Math.max(8, width - visibleWidth(prefix));
  for (const part of wrapLine(text, contentWidth)) lines.push(`${prefix}${part}`);
}

function wrapLine(text, maxWidth) {
  if (maxWidth <= 0) return [""];
  const result = [];
  let cur = "", curW = 0, activeSgr = "";
  for (let i = 0; i < text.length;) {
    if (text[i] === "\x1b") {
      const match = text.slice(i).match(/^\x1b\[[0-?]*[ -/]*[@-~]/);
      if (match) {
        cur += match[0];
        activeSgr = updateActiveSgr(activeSgr, match[0]);
        i += match[0].length;
        continue;
      }
    }
    const ch = text[i], w = visibleWidth(ch);
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
  return result.length > 0 ? result : [""];
}

function updateActiveSgr(activeSgr, seq) {
  if (!seq.endsWith("m")) return activeSgr;
  const body = seq.slice(2, -1);
  if (body === "" || body.split(";").includes("0")) return "";
  return seq;
}
