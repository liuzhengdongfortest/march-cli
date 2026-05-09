import { visibleWidth, truncateToWidth } from "@mariozechner/pi-tui";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function wrapLine(text, maxWidth) {
  if (maxWidth <= 0) return [""];
  const result = [];
  let cur = "";
  let curW = 0;
  for (const ch of text) {
    const w = visibleWidth(ch);
    if (curW + w > maxWidth) {
      result.push(cur);
      cur = ch;
      curW = w;
    } else {
      cur += ch;
      curW += w;
    }
  }
  if (cur) result.push(cur);
  return result.length > 0 ? result : [""];
}

export class OutputBuffer {
  constructor() {
    this.segments = [];
    this.currentText = [""];
    this.spinning = false;
    this.spinnerText = "";
    this.spinnerIdx = 0;
    this._activeThinking = null;
  }

  write(text) {
    const parts = text.split("\n");
    this.currentText[this.currentText.length - 1] += parts[0];
    for (let i = 1; i < parts.length; i++) {
      this.currentText.push(parts[i]);
    }
  }

  writeln(text) {
    this.currentText[this.currentText.length - 1] += text;
    this.currentText.push("");
  }

  startThinking() {
    this._flushText();
    const seg = { type: "thinking", tokens: 0, content: [] };
    this.segments.push(seg);
    this._activeThinking = seg;
  }

  appendThinking(text) {
    if (!this._activeThinking) this.startThinking();
    const parts = text.split("\n");
    const lastIdx = this._activeThinking.content.length - 1;
    if (lastIdx >= 0) {
      this._activeThinking.content[lastIdx] += parts[0];
    } else {
      this._activeThinking.content.push(parts[0]);
    }
    for (let i = 1; i < parts.length; i++) {
      this._activeThinking.content.push(parts[i]);
    }
  }

  endThinking(tokens) {
    if (this._activeThinking) {
      this._activeThinking.tokens = tokens;
      this._activeThinking = null;
    }
  }

  addThinkingBlock(tokens, content) {
    this._flushText();
    this.segments.push({
      type: "thinking",
      tokens,
      content: content.split("\n"),
    });
  }

  _flushText() {
    if (this.currentText.length > 1 || this.currentText[0] !== "") {
      this.segments.push({ type: "text", lines: [...this.currentText] });
      this.currentText = [""];
    }
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
      if (seg.type === "text") {
        for (const line of seg.lines) {
          lines.push(visibleWidth(line) > width ? truncateToWidth(line, width) : line);
        }
      } else if (seg.type === "thinking") {
        lines.push(`\x1b[3;90m· thinking (${seg.tokens} tokens)\x1b[0m`);
        const indent = width > 40 ? width - 40 : width - 2;
        const maxContentWidth = Math.max(20, indent);
        for (const line of seg.content) {
          for (const w of wrapLine(line, maxContentWidth)) {
            lines.push(`\x1b[3;90m  ${w}\x1b[0m`);
          }
        }
      }
    }
    for (const line of this.currentText) {
      lines.push(visibleWidth(line) > width ? truncateToWidth(line, width) : line);
    }
    if (this.spinning) {
      const frame = SPINNER_FRAMES[this.spinnerIdx];
      lines.push(`\x1b[90m${frame} ${this.spinnerText}\x1b[0m`);
    }
    return lines;
  }
}
