import { renderToolCardBlock } from "./tool-card-renderer.mjs";
import { appendTextLines, wrapLine } from "./text-line-renderer.mjs";
import { renderMarkdown, renderStreamingMarkdown } from "../markdown-renderer.mjs";
import { renderEditDiffBlock } from "../tui-diff-rendering.mjs";
import { appendSelectableEntries } from "./selectable-copy.mjs";
import { contentWidthAfterPrefix } from "./content-width.mjs";
import { dim } from "../ui-theme.mjs";

export class OutputLayoutCache {
  constructor() {
    this._blockIds = new WeakMap();
    this._layouts = new Map();
    this._nextBlockId = 1;
  }

  clear() {
    this._layouts.clear();
  }

  invalidateBlock(block) {
    bumpBlockRevision(block);
  }

  layoutFor(block, width) {
    const safeWidth = Math.max(1, Math.trunc(width));
    const key = this._cacheKey(block, safeWidth);
    const cached = this._layouts.get(key);
    if (cached) return cached;
    const lines = renderBlock(block, safeWidth);
    const entries = [];
    appendSelectableEntries(entries, block, lines, safeWidth);
    const layout = { block, lines, entries, lineCount: entries.length };
    if (isCacheableBlock(block)) this._layouts.set(key, layout);
    return layout;
  }

  _cacheKey(block, width) {
    let id = this._blockIds.get(block);
    if (!id) {
      id = this._nextBlockId++;
      this._blockIds.set(block, id);
    }
    return `${id}:${width}:${blockRevision(block)}`;
  }
}

export function bumpBlockRevision(block) {
  if (!block || typeof block !== "object") return;
  block.__outputRevision = blockRevision(block) + 1;
}

function blockRevision(block) {
  return Number.isFinite(block?.__outputRevision) ? block.__outputRevision : 0;
}

function isCacheableBlock(block) {
  return Boolean(block && typeof block === "object");
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
  const prefix = "  ";
  const maxContentWidth = contentWidthAfterPrefix(width, prefix);
  for (const line of block.content) {
    for (const w of wrapLine(line, maxContentWidth)) lines.push(dim(`${prefix}${w}`));
  }
  return lines;
}
