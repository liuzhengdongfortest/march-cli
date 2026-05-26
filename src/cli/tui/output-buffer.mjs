import { brightBlack } from "./ui-theme.mjs";
import { restoreTimelineBlocksToOutputBuffer } from "./output/timeline-block-restore.mjs";
import { OutputScrollState } from "./output/scroll-state.mjs";
import { copySourceTextForRange } from "./output/selectable-copy.mjs";
import { OutputDocument } from "./output/output-document.mjs";
import { OutputLayoutCache } from "./output/block-layout.mjs";
import { appendTailEntry, planVisibleBlockEntries, sumLayoutLines } from "./output/viewport-planner.mjs";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export class OutputBuffer {
  constructor() {
    this.document = new OutputDocument();
    this.layoutCache = new OutputLayoutCache();
    this.spinning = false;
    this.spinnerText = "";
    this.spinnerIdx = 0;
    this.scrollState = new OutputScrollState();
  }

  get segments() { return this.document.segments; }
  get scrollOffset() { return this.scrollState.offset; }

  clear() {
    this.document.clear();
    this.layoutCache.clear();
    this.spinning = false;
    this.spinnerText = "";
    this.spinnerIdx = 0;
    this.scrollState.clear();
  }

  restoreTimelineBlocks(blocks) {
    restoreTimelineBlocksToOutputBuffer(this, blocks);
  }

  write(text) { this.document.writeText(text, false); }
  writeMarkdown(text) { this.document.writeText(text, true); }
  writeln(text) { this.document.writeln(text); }
  ensureNewline() { return this.document.ensureNewline(); }

  startThinking() {
    const block = this.document.startThinking();
    this.layoutCache.invalidateBlock(block);
  }

  appendThinking(text) {
    this.layoutCache.invalidateBlock(this.document.appendThinking(text));
  }

  endThinking(tokens) {
    const block = this.document.endThinking(tokens);
    if (block) this.layoutCache.invalidateBlock(block);
  }

  addThinkingBlock(tokens, content) {
    this.layoutCache.invalidateBlock(this.document.addThinkingBlock(tokens, content));
  }

  addBlock(block) {
    this.layoutCache.invalidateBlock(this.document.addBlock(block));
  }

  setOverlayStatus(lines) { this.document.setOverlayStatus(lines); }
  clearOverlayStatus() { this.document.clearOverlayStatus(); }
  sealCurrentText() { return this.document.flushText(); }

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
      this.layoutCache.invalidateBlock(seg);
      changed = true;
    }
    return changed;
  }

  toggleToolCardAtVisibleRow(row, width) {
    const entry = this._visibleEntryAt(row, width);
    const block = entry?.block;
    if (block?.type !== "tool-card") return false;
    block.expanded = !block.expanded;
    this.layoutCache.invalidateBlock(block);
    return true;
  }

  invalidate() { this.layoutCache.clear(); }
  invalidateBlock(block) { this.layoutCache.invalidateBlock(block); }

  render(width) {
    return this.renderSelectable(width).lines;
  }

  renderSelectable(width) {
    const entries = this._visibleEntries(width);
    return {
      lines: entries.map((entry) => entry.line),
      copyText: (range) => copySourceTextForRange(entries, range),
    };
  }

  _visibleEntryAt(row, width) {
    const visibleRow = Math.trunc(row);
    if (visibleRow < 0) return null;
    return this._visibleEntries(width)[visibleRow] ?? null;
  }

  _visibleEntries(width) {
    const layouts = this._blockLayouts(width);
    const baseTotal = sumLayoutLines(layouts);
    const tailLine = this.spinning ? this._spinnerLine() : null;
    const total = baseTotal + (tailLine == null ? 0 : 1);
    this.scrollState.setTotalLines(total);
    const range = this.scrollState.sliceRange();
    const entries = planVisibleBlockEntries(layouts, range);
    if (tailLine != null && (!range || (range.start <= baseTotal && range.end > baseTotal))) {
      return appendTailEntry(entries, tailLine, baseTotal);
    }
    return entries;
  }

  _blockLayouts(width) {
    return this.document.blocksForRender().map((block) => this.layoutCache.layoutFor(block, width));
  }

  _spinnerLine() {
    return brightBlack(`${SPINNER_FRAMES[this.spinnerIdx]} ${this.spinnerText}`);
  }
}
