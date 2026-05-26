export class OutputDocument {
  constructor() {
    this.segments = [];
    this.currentText = [{ text: "", markdown: false }];
    this.currentTextCache = new Map();
    this.activeThinking = null;
    this.overlayStatus = null;
  }

  clear() {
    this.segments = [];
    this.currentText = [{ text: "", markdown: false }];
    this.currentTextCache = new Map();
    this.activeThinking = null;
    this.overlayStatus = null;
  }

  writeText(text, markdown) {
    this.overlayStatus = null;
    const current = this.currentText.at(-1);
    if (current.markdown !== markdown && current.text !== "") this.currentText.push({ text: "", markdown });
    else current.markdown = markdown;
    const parts = String(text ?? "").split("\n");
    this.currentText[this.currentText.length - 1].text += parts[0];
    for (let i = 1; i < parts.length; i += 1) this.currentText.push({ text: parts[i], markdown });
  }

  writeln(text) {
    this.overlayStatus = null;
    this.currentText[this.currentText.length - 1].text += String(text ?? "");
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
    this.flushText();
    this.activeThinking = { type: "thinking", tokens: 0, content: [] };
    this.segments.push(this.activeThinking);
    return this.activeThinking;
  }

  appendThinking(text) {
    const block = this.activeThinking ?? this.startThinking();
    const parts = String(text ?? "").split("\n");
    const lastIdx = block.content.length - 1;
    if (lastIdx >= 0) block.content[lastIdx] += parts[0];
    else block.content.push(parts[0]);
    for (let i = 1; i < parts.length; i += 1) block.content.push(parts[i]);
    return block;
  }

  endThinking(tokens) {
    if (!this.activeThinking) return null;
    const block = this.activeThinking;
    block.tokens = tokens;
    this.activeThinking = null;
    return block;
  }

  addThinkingBlock(tokens, content) {
    this.overlayStatus = null;
    this.flushText();
    const block = { type: "thinking", tokens, content: String(content ?? "").split("\n") };
    this.segments.push(block);
    return block;
  }

  addBlock(block) {
    this.overlayStatus = null;
    this.flushText();
    this.segments.push(block);
    return block;
  }

  setOverlayStatus(lines) {
    this.overlayStatus = Array.isArray(lines) ? { type: "status", lines } : null;
  }

  clearOverlayStatus() {
    this.overlayStatus = null;
  }

  flushText() {
    if (this.currentText.length <= 1 && this.currentText[0].text === "") return false;
    this.segments.push(...currentTextToBlocks(this.currentText, true));
    this.currentText = [{ text: "", markdown: false }];
    this.currentTextCache = new Map();
    return true;
  }

  blocksForRender() {
    const blocks = [...this.segments];
    blocks.push(...currentTextToBlocks(this.currentText, false, this.currentTextCache));
    if (this.overlayStatus) blocks.push(this.overlayStatus);
    return blocks;
  }
}

export function currentTextToBlocks(textLines, sealed, cache = null) {
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
