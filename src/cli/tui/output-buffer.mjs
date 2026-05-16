import { visibleWidth } from "@earendil-works/pi-tui";
import { R, brightBlack, dim } from "./ui-theme.mjs";
import { renderMarkdown, renderStreamingMarkdown } from "./markdown-renderer.mjs";
import { renderEditDiffBlock } from "./tui-diff-rendering.mjs";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function wrapLine(text, maxWidth) {
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
  return result.length > 0 ? result : [""];
}

function updateActiveSgr(activeSgr, seq) {
  if (!seq.endsWith("m")) return activeSgr;
  const body = seq.slice(2, -1);
  if (body === "" || body.split(";").includes("0")) return "";
  return seq;
}

function appendTextLines(lines, textLines, width) {
  for (const line of textLines) {
    for (const wrapped of wrapLine(line, width)) lines.push(wrapped);
  }
}

function currentTextToBlocks(textLines, sealed, cache = null) {
  const blocks = [];
  for (let i = 0; i < textLines.length;) {
    const markdown = textLines[i].markdown;
    const batch = [];
    while (i < textLines.length && textLines[i].markdown === markdown) {
      batch.push(textLines[i].text);
      i += 1;
    }
    blocks.push(markdown
      ? { type: "markdown", text: batch.join("\n"), sealed, cache: sealed ? new Map() : (cache ?? new Map()) }
      : { type: "plain", lines: batch });
  }
  return blocks;
}

function renderBlock(block, width) {
  if (block.type === "diff") return renderEditDiffBlock(block, width);
  if (block.type === "plain" || block.type === "tool" || block.type === "status") return renderPlainBlock(block, width);
  if (block.type === "markdown") return renderMarkdownBlock(block, width);
  if (block.type === "thinking") return renderThinkingBlock(block, width);
  return [];
}

function renderPlainBlock(block, width) {
  const lines = [];
  appendTextLines(lines, block.lines, width);
  return lines;
}

function renderMarkdownBlock(block, width) {
  if (!block.sealed) return renderStreamingMarkdown(block.text, width, block.cache);
  const cached = block.cache.get(width);
  if (cached) return cached;
  const rendered = renderMarkdown(block.text, width);
  block.cache.set(width, rendered);
  return rendered;
}

function renderThinkingBlock(block, width) {
  const lines = [dim(`· thinking (${block.tokens} tokens)`)];
  const indent = width > 40 ? width - 40 : width - 2;
  const maxContentWidth = Math.max(20, indent);
  for (const line of block.content) {
    for (const w of wrapLine(line, maxContentWidth)) lines.push(dim(`  ${w}`));
  }
  return lines;
}

export class OutputBuffer {
  constructor() {
    this.segments = [];
    this.currentText = [{ text: "", markdown: false }];
    this.currentTextCache = new Map();
    this.spinning = false;
    this.spinnerText = "";
    this.spinnerIdx = 0;
    this._activeThinking = null;
    this.overlayStatus = null;
  }

  clear() {
    this.segments = [];
    this.currentText = [{ text: "", markdown: false }];
    this.currentTextCache = new Map();
    this.spinning = false;
    this.spinnerText = "";
    this.spinnerIdx = 0;
    this._activeThinking = null;
    this.overlayStatus = null;
  }

  write(text) {
    this._writeText(text, false);
  }

  writeMarkdown(text) {
    this._writeText(text, true);
  }

  _writeText(text, markdown) {
    this.overlayStatus = null;
    const current = this.currentText.at(-1);
    if (current.markdown !== markdown && current.text !== "") {
      this.currentText.push({ text: "", markdown });
    } else {
      current.markdown = markdown;
    }
    const parts = text.split("\n");
    this.currentText[this.currentText.length - 1].text += parts[0];
    for (let i = 1; i < parts.length; i++) this.currentText.push({ text: parts[i], markdown });
  }

  writeln(text) {
    this.overlayStatus = null;
    this.currentText[this.currentText.length - 1].text += text;
    this.currentText.push({ text: "", markdown: false });
  }

  ensureNewline() {
    const current = this.currentText.at(-1);
    if (!current || current.text === "") return false;
    this.currentText.push({ text: "", markdown: false });
    return true;
  }

  startThinking() {
    this.overlayStatus = null;
    this._flushText();
    const seg = { type: "thinking", tokens: 0, content: [] };
    this.segments.push(seg);
    this._activeThinking = seg;
  }

  appendThinking(text) {
    if (!this._activeThinking) this.startThinking();
    const parts = text.split("\n");
    const lastIdx = this._activeThinking.content.length - 1;
    if (lastIdx >= 0) this._activeThinking.content[lastIdx] += parts[0];
    else this._activeThinking.content.push(parts[0]);
    for (let i = 1; i < parts.length; i++) this._activeThinking.content.push(parts[i]);
  }

  endThinking(tokens) {
    if (this._activeThinking) {
      this._activeThinking.tokens = tokens;
      this._activeThinking = null;
    }
  }

  addThinkingBlock(tokens, content) {
    this.overlayStatus = null;
    this._flushText();
    this.segments.push({ type: "thinking", tokens, content: content.split("\n") });
  }

  addBlock(block) {
    this.overlayStatus = null;
    this._flushText();
    this.segments.push(block);
  }

  setOverlayStatus(lines) {
    this.overlayStatus = Array.isArray(lines) ? { type: "status", lines } : null;
  }

  clearOverlayStatus() {
    this.overlayStatus = null;
  }

  sealCurrentText() {
    return this._flushText();
  }

  _flushText() {
    if (this.currentText.length <= 1 && this.currentText[0].text === "") return false;
    this.segments.push(...currentTextToBlocks(this.currentText, true));
    this.currentText = [{ text: "", markdown: false }];
    this.currentTextCache = new Map();
    return true;
  }

  setSpinner(on, text) {
    this.spinning = on;
    if (text !== undefined) this.spinnerText = text;
  }

  tick() {
    this.spinnerIdx = (this.spinnerIdx + 1) % SPINNER_FRAMES.length;
  }

  invalidate() {}

  render(width) {
    const lines = [];
    for (const seg of this.segments) {
      for (const line of renderBlock(seg, width)) lines.push(line);
    }
    for (const block of currentTextToBlocks(this.currentText, false, this.currentTextCache)) {
      for (const line of renderBlock(block, width)) lines.push(line);
    }
    if (this.overlayStatus) {
      for (const line of renderBlock(this.overlayStatus, width)) lines.push(line);
    }
    if (this.spinning) {
      const frame = SPINNER_FRAMES[this.spinnerIdx];
      lines.push(brightBlack(`${frame} ${this.spinnerText}`));
    }
    return lines;
  }
}
