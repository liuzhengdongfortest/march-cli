import { brightBlack, dim } from "./ui-theme.mjs";
import { renderToolCardBlock } from "./output/tool-card-renderer.mjs";
import { renderMarkdown, renderStreamingMarkdown } from "./markdown-renderer.mjs";
import { renderEditDiffBlock } from "./tui-diff-rendering.mjs";
import { restoreTimelineBlocksToOutputBuffer } from "./output/timeline-block-restore.mjs";
import { OutputScrollState } from "./output/scroll-state.mjs";
import { appendTextLines, wrapLine } from "./output/text-line-renderer.mjs";
import { appendSelectableEntries, copySourceTextForRange, sliceEntriesWithTail } from "./output/selectable-copy.mjs";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
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
  if (block.type === "tool-card") return renderToolCardBlock(block, width);
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
    this.scrollState = new OutputScrollState();
    this._baseLinesCache = new Map();
    this._baseEntriesCache = new Map();
  }

  get scrollOffset() { return this.scrollState.offset; }

  clear() {
    this.segments = [];
    this.currentText = [{ text: "", markdown: false }];
    this.currentTextCache = new Map();
    this.spinning = false;
    this.spinnerText = "";
    this.spinnerIdx = 0;
    this._activeThinking = null;
    this.overlayStatus = null;
    this.scrollState.clear();
    this._baseLinesCache = new Map();
    this._baseEntriesCache = new Map();
  }

  restoreTimelineBlocks(blocks) {
    restoreTimelineBlocksToOutputBuffer(this, blocks);
  }

  write(text) { this._writeText(text, false); }
  writeMarkdown(text) { this._writeText(text, true); }

  _writeText(text, markdown) {
    this.overlayStatus = null;
    this._invalidateBaseLines();
    const current = this.currentText.at(-1);
    if (current.markdown !== markdown && current.text !== "") this.currentText.push({ text: "", markdown });
    else current.markdown = markdown;
    const parts = text.split("\n");
    this.currentText[this.currentText.length - 1].text += parts[0];
    for (let i = 1; i < parts.length; i++) this.currentText.push({ text: parts[i], markdown });
  }

  writeln(text) {
    this.overlayStatus = null;
    this._invalidateBaseLines();
    this.currentText[this.currentText.length - 1].text += text;
    this.currentText.push({ text: "", markdown: false });
  }

  ensureNewline() {
    const current = this.currentText.at(-1);
    if (!current || current.text === "") return false;
    this.currentText.push({ text: "", markdown: false });
    this._invalidateBaseLines();
    return true;
  }

  startThinking() {
    this.overlayStatus = null;
    this._flushText();
    this._activeThinking = { type: "thinking", tokens: 0, content: [] };
    this.segments.push(this._activeThinking);
    this._invalidateBaseLines();
  }

  appendThinking(text) {
    if (!this._activeThinking) this.startThinking();
    const parts = text.split("\n");
    const lastIdx = this._activeThinking.content.length - 1;
    if (lastIdx >= 0) this._activeThinking.content[lastIdx] += parts[0];
    else this._activeThinking.content.push(parts[0]);
    for (let i = 1; i < parts.length; i++) this._activeThinking.content.push(parts[i]);
    this._invalidateBaseLines();
  }

  endThinking(tokens) {
    if (!this._activeThinking) return;
    this._activeThinking.tokens = tokens;
    this._activeThinking = null;
    this._invalidateBaseLines();
  }

  addThinkingBlock(tokens, content) {
    this.overlayStatus = null;
    this._flushText();
    this.segments.push({ type: "thinking", tokens, content: content.split("\n") });
    this._invalidateBaseLines();
  }

  addBlock(block) {
    this.overlayStatus = null;
    this._flushText();
    this.segments.push(block);
    this._invalidateBaseLines();
  }

  setOverlayStatus(lines) {
    this.overlayStatus = Array.isArray(lines) ? { type: "status", lines } : null;
    this._invalidateBaseLines();
  }

  clearOverlayStatus() {
    this.overlayStatus = null;
    this._invalidateBaseLines();
  }

  sealCurrentText() { return this._flushText(); }

  _flushText() {
    if (this.currentText.length <= 1 && this.currentText[0].text === "") return false;
    this.segments.push(...currentTextToBlocks(this.currentText, true));
    this._invalidateBaseLines();
    this.currentText = [{ text: "", markdown: false }];
    this.currentTextCache = new Map();
    return true;
  }

  setSpinner(on, text) {
    this.spinning = on;
    if (text !== undefined) this.spinnerText = text;
  }

  tick() { this.spinnerIdx = (this.spinnerIdx + 1) % SPINNER_FRAMES.length; }
  scroll(delta, options) { return this.scrollState.scroll(delta, options); }
  getScrollStep() { return this.scrollState.getStep(); }
  getMaxScrollOffset() { return this.scrollState.getMaxOffset(); }
  setViewportHeight(height) { this.scrollState.setViewportHeight(height); }
  resetScroll() { this.scrollState.reset(); }

  setToolCardsExpanded(expanded) {
    let changed = false;
    for (const seg of this.segments) {
      if (seg.type !== "tool-card" || seg.expanded === expanded) continue;
      seg.expanded = expanded;
      changed = true;
    }
    if (changed) this._invalidateBaseLines();
    return changed;
  }

  toggleToolCardAtVisibleRow(row, width) {
    const entry = this._visibleEntryAt(row, width);
    const block = entry?.block;
    if (block?.type !== "tool-card") return false;
    block.expanded = !block.expanded;
    this._invalidateBaseLines();
    return true;
  }

  invalidate() { this._invalidateBaseLines(); }

  _invalidateBaseLines() {
    this._baseLinesCache.clear();
    this._baseEntriesCache.clear();
  }

  render(width) {
    return this.renderSelectable(width).lines;
  }

  renderSelectable(width) {
    const baseEntries = this._renderBaseEntries(width);
    const tailLine = this.spinning ? this._spinnerLine() : null;
    this.scrollState.setTotalLines(baseEntries.length + (tailLine == null ? 0 : 1));
    const entries = sliceEntriesWithTail(baseEntries, tailLine, this.scrollState.sliceRange());
    return {
      lines: entries.map((entry) => entry.line),
      copyText: (range) => copySourceTextForRange(entries, range),
    };
  }

  _spinnerLine() {
    return brightBlack(`${SPINNER_FRAMES[this.spinnerIdx]} ${this.spinnerText}`);
  }

  _visibleEntryAt(row, width) {
    const visibleRow = Math.trunc(row);
    if (visibleRow < 0) return null;
    const baseEntries = this._renderBaseEntries(width);
    const tailLine = this.spinning ? this._spinnerLine() : null;
    const entries = sliceEntriesWithTail(baseEntries, tailLine, this.scrollState.sliceRange());
    return entries[visibleRow] ?? null;
  }

  _renderBaseLines(width) {
    const cached = this._baseLinesCache.get(width);
    if (cached) return cached;
    const lines = this._renderBaseEntries(width).map((entry) => entry.line);
    this._baseLinesCache.set(width, lines);
    return lines;
  }

  _renderBaseEntries(width) {
    const cached = this._baseEntriesCache.get(width);
    if (cached) return cached;
    const entries = [];
    for (const block of this._blocksForRender()) appendBlockEntries(entries, block, width);
    this._baseEntriesCache.set(width, entries);
    return entries;
  }

  _blocksForRender() {
    const blocks = [...this.segments];
    blocks.push(...currentTextToBlocks(this.currentText, false, this.currentTextCache));
    if (this.overlayStatus) blocks.push(this.overlayStatus);
    return blocks;
  }
}

function appendBlockEntries(entries, block, width) {
  appendSelectableEntries(entries, block, renderBlock(block, width), width);
}
