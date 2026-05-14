import { visibleWidth } from "@mariozechner/pi-tui";
import { R, brightBlack, dim } from "./ui-theme.mjs";

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

function appendText(lines, text, width) {
  for (const wrapped of wrapLine(text, width)) lines.push(wrapped);
}

function appendMarkdownLine(lines, line, width) {
  for (const wrapped of wrapMarkdownTokens(parseMarkdownLine(line), width)) {
    lines.push(renderMarkdownTokens(wrapped));
  }
}

function parseMarkdownLine(line) {
  const heading = line.match(/^#{1,6}\s+(.+)$/);
  if (heading) return [{ text: heading[1], color: "orange" }];
  const strongLine = line.match(/^\*\*(.+)\*\*$/);
  if (strongLine) return [{ text: strongLine[1], color: "orange" }];

  const tokens = [];
  let index = 0;
  const codeRe = /`([^`]+)`/g;
  for (let match = codeRe.exec(line); match; match = codeRe.exec(line)) {
    if (match.index > index) tokens.push({ text: line.slice(index, match.index), color: null });
    tokens.push({ text: match[1], color: "green" });
    index = match.index + match[0].length;
  }
  if (index < line.length) tokens.push({ text: line.slice(index), color: null });
  return tokens.length > 0 ? tokens : [{ text: line, color: null }];
}

function wrapMarkdownTokens(tokens, width) {
  if (width <= 0) return [[{ text: "", color: null }]];
  const lines = [];
  let current = [];
  let currentWidth = 0;
  for (const token of tokens) {
    for (const ch of token.text) {
      const charWidth = visibleWidth(ch);
      if (currentWidth + charWidth > width && current.length > 0) {
        lines.push(current);
        current = [];
        currentWidth = 0;
      }
      current.push({ text: ch, color: token.color });
      currentWidth += charWidth;
    }
  }
  lines.push(current);
  return lines;
}

function renderMarkdownTokens(tokens) {
  let out = "";
  let color = null;
  for (const token of tokens) {
    if (token.color !== color) {
      if (color) out += R;
      color = token.color;
      if (color === "orange") out += "\x1b[38;2;245;167;66m";
      else if (color === "green") out += "\x1b[38;2;127;216;143m";
    }
    out += token.text;
  }
  if (color) out += R;
  return out;
}

export class OutputBuffer {
  constructor() {
    this.segments = [];
    this.currentText = [{ text: "", markdown: false }];
    this.spinning = false;
    this.spinnerText = "";
    this.spinnerIdx = 0;
    this._activeThinking = null;
  }

  write(text) {
    this._writeText(text, false);
  }

  writeMarkdown(text) {
    this._writeText(text, true);
  }

  _writeText(text, markdown) {
    const current = this.currentText.at(-1);
    if (current.markdown !== markdown && current.text !== "") {
      this.currentText.push({ text: "", markdown });
    } else {
      current.markdown = markdown;
    }
    const parts = text.split("\n");
    this.currentText[this.currentText.length - 1].text += parts[0];
    for (let i = 1; i < parts.length; i++) {
      this.currentText.push({ text: parts[i], markdown });
    }
  }

  writeln(text) {
    this.currentText[this.currentText.length - 1].text += text;
    this.currentText.push({ text: "", markdown: false });
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
    if (this.currentText.length > 1 || this.currentText[0].text !== "") {
      this.segments.push({ type: "text", lines: [...this.currentText] });
      this.currentText = [{ text: "", markdown: false }];
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
          if (line.markdown) appendMarkdownLine(lines, line.text, width);
          else appendText(lines, line.text, width);
        }
      } else if (seg.type === "thinking") {
        lines.push(dim(`· thinking (${seg.tokens} tokens)`));
        const indent = width > 40 ? width - 40 : width - 2;
        const maxContentWidth = Math.max(20, indent);
        for (const line of seg.content) {
          for (const w of wrapLine(line, maxContentWidth)) {
            lines.push(dim(`  ${w}`));
          }
        }
      }
    }
    for (const line of this.currentText) {
      if (line.markdown) appendMarkdownLine(lines, line.text, width);
      else appendText(lines, line.text, width);
    }
    if (this.spinning) {
      const frame = SPINNER_FRAMES[this.spinnerIdx];
      lines.push(brightBlack(`${frame} ${this.spinnerText}`));
    }
    return lines;
  }
}
