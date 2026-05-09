import { stdout } from "node:process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import {
  CombinedAutocompleteProvider,
  Editor,
  ProcessTerminal,
  TUI,
  visibleWidth,
  truncateToWidth,
} from "@mariozechner/pi-tui";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const SPINNER_INTERVAL = 80;

// Word-wrap a string at `maxWidth` visible columns, breaking at grapheme
// boundaries. Returns an array of lines each ≤ maxWidth visible width.
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

function extractToolOutput(result) {
  try {
    const content = result?.content;
    if (Array.isArray(content)) {
      return content.filter(c => c.type === "text").map(c => c.text).join("\n");
    }
  } catch {}
  return "";
}

const MARCH_COMMANDS = [
  { name: "exit", description: "Exit March" },
  { name: "quit", description: "Exit March" },
  { name: "help", description: "Show available commands" },
  { name: "model", description: "Cycle to next available model" },
  { name: "models", description: "List available models" },
  { name: "compact", description: "Compact session context" },
  { name: "session", description: "Show session stats (tokens, cost, messages)" },
  { name: "sessions", description: "List saved sessions" },
  { name: "status", description: "Show current session status" },
  { name: "save", description: "Save current session" },
  { name: "pin", description: "Pin a file to context" },
  { name: "unpin", description: "Unpin a file from context" },
  { name: "pins", description: "List pinned files" },
  { name: "thinking", description: "Toggle last thinking block expand/collapse" },
  { name: "mouse", description: "Toggle mouse tracking (for text selection vs click-to-expand)" },
];

const EDITOR_THEME = {
  borderColor: (str) => `\x1b[90m${str}\x1b[0m`,
  selectList: {
    selectedPrefix: (text) => `\x1b[36m${text}\x1b[0m`,
    selectedText: (text) => `\x1b[37m${text}\x1b[0m`,
    description: (text) => `\x1b[90m${text}\x1b[0m`,
    scrollInfo: (text) => `\x1b[90m${text}\x1b[0m`,
    noMatch: (text) => `\x1b[90m${text}\x1b[0m`,
  },
};

// ── OutputBuffer (segment-based) ────────────────────────────────────
// Stores text and thinking blocks as segments.
// Thinking blocks are collapsed by default; expand via Tab or /thinking.

class OutputBuffer {
  constructor() {
    this.segments = [];
    this.currentText = [""];
    this.spinning = false;
    this.spinnerText = "";
    this.spinnerIdx = 0;
    this._activeThinking = null;
  }

  // ── text accumulation ──────────────────────────────────────────

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

  // ── thinking blocks ─────────────────────────────────────────────

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

  // Legacy: add a pre-built thinking block (used by JSON/plain UI fallbacks)
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

  // ── spinner ─────────────────────────────────────────────────────

  setSpinner(on, text) {
    this.spinning = on;
    if (text !== undefined) this.spinnerText = text;
  }

  tick() {
    this.spinnerIdx = (this.spinnerIdx + 1) % SPINNER_FRAMES.length;
  }

  invalidate() {}

  // ── render ──────────────────────────────────────────────────────

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

// ── TUI-based UI ────────────────────────────────────────────────────

function createTuiUI() {
  const terminal = new ProcessTerminal();
  const tui = new TUI(terminal);
  const output = new OutputBuffer();
  const editor = new Editor(tui, EDITOR_THEME, { paddingX: 1 });
  const autocomplete = new CombinedAutocompleteProvider(MARCH_COMMANDS, process.cwd());
  editor.setAutocompleteProvider(autocomplete);

  tui.addChild(output);
  tui.addChild(editor);
  tui.setFocus(editor);

  let spinnerTimer = null;
  let started = false;
  let mouseOn = false;

  function requestRender() {
    tui.requestRender();
  }

  function startSpinner(text) {
    output.setSpinner(true, text);
    if (!spinnerTimer) {
      spinnerTimer = setInterval(() => {
        output.tick();
        requestRender();
      }, SPINNER_INTERVAL);
    }
    requestRender();
  }

  function stopSpinner() {
    if (spinnerTimer) {
      clearInterval(spinnerTimer);
      spinnerTimer = null;
    }
    output.setSpinner(false, "");
    requestRender();
  }

  let onEscapeHandler = null;
  let onShiftTabHandler = null;

  function ensureStarted() {
    if (!started) {
      tui.addInputListener((data) => {
        // Esc: cancel autocomplete if active, otherwise invoke app handler
        if (data === "\x1b") {
          if (editor.isShowingAutocomplete()) return; // let Editor cancel it
          if (onEscapeHandler) { onEscapeHandler(); return { consume: true }; }
        }
        // Shift+Tab: cycle thinking level
        if (data === "\x1b[Z" && onShiftTabHandler) {
          onShiftTabHandler();
          return { consume: true };
        }
        // Ctrl+G: open external editor
        if (data === "\x07") {
          openExternalEditor();
          return { consume: true };
        }
      });
      tui.start();
      started = true;
    }
  }

  function openExternalEditor() {
    const editorCmd = process.env.VISUAL || process.env.EDITOR;
    if (!editorCmd) {
      output.writeln(`\x1b[33m● No editor configured. Set $VISUAL or $EDITOR.\x1b[0m`);
      requestRender();
      return;
    }
    const currentText = editor.getText();
    const tmpFile = join(tmpdir(), `march-editor-${Date.now()}.md`);
    try {
      writeFileSync(tmpFile, currentText, "utf8");
      // Stop TUI to release terminal for external editor
      tui.stop();
      if (mouseOn) terminal.write("\x1b[?1002l\x1b[?1006l");
      const [bin, ...args] = editorCmd.split(" ");
      const result = spawnSync(bin, [...args, tmpFile], {
        stdio: "inherit",
        shell: process.platform === "win32",
      });
      if (result.status === 0) {
        const newContent = readFileSync(tmpFile, "utf8").replace(/\n$/, "");
        editor.setText(newContent);
      }
    } finally {
      try { unlinkSync(tmpFile); } catch {}
      // Restart TUI
      tui.start();
      if (mouseOn) terminal.write("\x1b[?1002h\x1b[?1006h");
      tui.requestRender(true);
    }
  }

  let onSubmitResolve = null;

  return {
    readline: (_prompt) =>
      new Promise((resolve) => {
        ensureStarted();
        onSubmitResolve = resolve;
        editor.disableSubmit = false;
        editor.onSubmit = (text) => {
          editor.addToHistory(text);
          editor.disableSubmit = true;
          editor.onSubmit = undefined;
          const res = onSubmitResolve;
          onSubmitResolve = null;
          if (res) res(text);
        };
      }),

    write: (text) => {
      ensureStarted();
      output.write(text);
      requestRender();
    },

    writeln: (text) => {
      ensureStarted();
      output.writeln(text);
      requestRender();
    },

    thinkingStart: () => {
      output.startThinking();
      requestRender();
    },

    thinkingDelta: (delta) => {
      output.appendThinking(delta);
      requestRender();
    },

    thinkingEnd: (tokens) => {
      output.endThinking(tokens);
      requestRender();
    },

    thinkingBlock: (tokens, content) => {
      output.addThinkingBlock(tokens, content);
      requestRender();
    },

    toggleLastThinking: () => false,

    toolStart: (name, args) => {
      ensureStarted();
      stopSpinner();
      const shortArgs = JSON.stringify(args).slice(0, 120);
      output.writeln(`\x1b[2m  ◆ ${name} ${shortArgs}\x1b[0m`);
      requestRender();
    },

    toolEnd: (name, isError, result) => {
      if (isError) {
        const errText = extractToolOutput(result);
        output.writeln(`\x1b[31m  ◆ ${name} failed\x1b[0m`);
        if (errText) {
          for (const line of errText.split("\n").slice(0, 6)) {
            output.writeln(`\x1b[31m    ${line.slice(0, 120)}\x1b[0m`);
          }
        }
        requestRender();
      } else {
        const out = extractToolOutput(result);
        if (out) {
          const lines = out.split("\n");
          const show = lines.slice(0, 4);
          for (const line of show) {
            output.writeln(`\x1b[2m    ${line.slice(0, 120)}\x1b[0m`);
          }
          if (lines.length > 4) output.writeln(`\x1b[2m    … (${lines.length - 4} more lines)\x1b[0m`);
          requestRender();
        }
      }
    },

    textDelta: (delta) => {
      ensureStarted();
      stopSpinner();
      output.write(delta);
      requestRender();
    },

    status: (text) => {
      ensureStarted();
      stopSpinner();
      output.writeln(`\x1b[90m● ${text}\x1b[0m`);
      requestRender();
    },

    turnStart: () => {
      ensureStarted();
      startSpinner("Thinking...");
    },

    turnEnd: () => {
      stopSpinner();
    },

    summaryStart: () => {
      startSpinner("summarizing...");
    },

    summaryDone: () => {
      stopSpinner();
      output.writeln("");
      output.writeln(`\x1b[90m● summary · done\x1b[0m`);
      requestRender();
    },

    editDiff: (path, diffLines) => {
      ensureStarted();
      stopSpinner();
      output.writeln(`\x1b[2m  ± ${path}\x1b[0m`);
      for (const d of diffLines) {
        if (d.type === "del") {
          output.writeln(`\x1b[31m    - ${d.text}\x1b[0m`);
        } else if (d.type === "add") {
          output.writeln(`\x1b[32m    + ${d.text}\x1b[0m`);
        } else {
          output.writeln(`\x1b[2m      ${d.text}\x1b[0m`);
        }
      }
      requestRender();
    },

    toggleMouse: () => {
      if (mouseOn) {
        terminal.write("\x1b[?1002l\x1b[?1006l");
        mouseOn = false;
        return false;
      } else {
        terminal.write("\x1b[?1002h\x1b[?1006h");
        mouseOn = true;
        return true;
      }
    },

    setEscapeHandler: (fn) => { onEscapeHandler = fn; },
    setShiftTabHandler: (fn) => { onShiftTabHandler = fn; },

    openExternalEditor: () => { openExternalEditor(); },

    close: () => {
      stopSpinner();
      if (started) {
        if (mouseOn) terminal.write("\x1b[?1002l\x1b[?1006l");
        tui.stop();
      }
    },
  };
}

// ── JSON UI ─────────────────────────────────────────────────────────

function createJsonUI() {
  let thinkingBuf = "";
  return {
    readline: () => Promise.resolve(""),
    write: () => {},
    writeln: (text) => {
      stdout.write(text + "\n");
    },
    thinkingStart: () => { thinkingBuf = ""; },
    thinkingDelta: (delta) => { thinkingBuf += delta; },
    thinkingEnd: (tokens) => {
      stdout.write(JSON.stringify({ type: "thinking", tokens, content: thinkingBuf }) + "\n");
      thinkingBuf = "";
    },
    thinkingBlock: (tokens, content) => {
      stdout.write(JSON.stringify({ type: "thinking", tokens, content }) + "\n");
    },
    toggleLastThinking: () => {},
    toolStart: (name, args) => {
      stdout.write(JSON.stringify({ type: "tool_start", name, args }) + "\n");
    },
    toolEnd: (name, isError, result) => {
      stdout.write(JSON.stringify({ type: "tool_end", name, isError, output: extractToolOutput(result) }) + "\n");
    },
    textDelta: (delta) => {
      stdout.write(delta);
    },
    status: () => {},
    turnStart: () => {},
    turnEnd: () => {},
    summaryStart: () => {},
    summaryDone: () => {},
    editDiff: (path, diffLines) => {
      stdout.write(JSON.stringify({ type: "edit_diff", path, diff: diffLines }) + "\n");
    },
    setEscapeHandler: () => {},
    setShiftTabHandler: () => {},
    openExternalEditor: () => {},
    toggleMouse: () => false,
    close: () => {},
  };
}

// ── Plain-text UI (non-TTY fallback) ────────────────────────────────

function createPlainUI() {
  let thinkingBuf = "";
  return {
    readline: (_prompt) => Promise.resolve(""),
    write: (text) => { stdout.write(text); },
    writeln: (text) => { stdout.write(text + "\n"); },
    thinkingStart: () => { thinkingBuf = ""; },
    thinkingDelta: (delta) => { thinkingBuf += delta; },
    thinkingEnd: (tokens) => {
      stdout.write(`\n\x1b[90m--- thinking (${tokens} tokens) ---\x1b[0m\n`);
      stdout.write(`\x1b[90m${thinkingBuf}\x1b[0m\n`);
      stdout.write(`\x1b[90m--- end thinking ---\x1b[0m\n\n`);
      thinkingBuf = "";
    },
    thinkingBlock: (tokens, content) => {
      stdout.write(`\n\x1b[90m--- thinking (${tokens} tokens) ---\x1b[0m\n`);
      stdout.write(`\x1b[90m${content}\x1b[0m\n`);
      stdout.write(`\x1b[90m--- end thinking ---\x1b[0m\n\n`);
    },
    toggleLastThinking: () => {},
    toolStart: (name, args) => {
      const shortArgs = JSON.stringify(args).slice(0, 120);
      stdout.write(`\n\x1b[2m  ◆ ${name} ${shortArgs}\x1b[0m\n`);
    },
    toolEnd: (name, isError, result) => {
      const out = extractToolOutput(result);
      if (isError) {
        stdout.write(`\x1b[31m  ◆ ${name} failed\x1b[0m\n`);
        if (out) stdout.write(`\x1b[31m    ${out.slice(0, 200)}\x1b[0m\n`);
      } else if (out) {
        stdout.write(`\x1b[2m    ${out.split("\n")[0].slice(0, 200)}\x1b[0m\n`);
      }
    },
    textDelta: (delta) => { stdout.write(delta); },
    status: (text) => { stdout.write(`\x1b[90m● ${text}\x1b[0m\n`); },
    turnStart: () => {},
    turnEnd: () => {},
    summaryStart: () => {},
    summaryDone: () => { stdout.write(`\n\x1b[90m● summary · done\x1b[0m\n`); },
    editDiff: (path, diffLines) => {
      stdout.write(`\n\x1b[2m  ± ${path}\x1b[0m\n`);
      for (const d of diffLines) {
        if (d.type === "del") stdout.write(`\x1b[31m    - ${d.text}\x1b[0m\n`);
        else if (d.type === "add") stdout.write(`\x1b[32m    + ${d.text}\x1b[0m\n`);
        else stdout.write(`\x1b[2m      ${d.text}\x1b[0m\n`);
      }
    },
    setEscapeHandler: () => {},
    setShiftTabHandler: () => {},
    openExternalEditor: () => {},
    toggleMouse: () => false,
    close: () => {},
  };
}

// ── Public API ──────────────────────────────────────────────────────

export function createUI({ json }) {
  if (json) return createJsonUI();
  if (!stdout.isTTY) return createPlainUI();
  return createTuiUI();
}
