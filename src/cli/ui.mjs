import { stdout } from "node:process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import {
  Editor,
  ProcessTerminal,
  TUI,
} from "@mariozechner/pi-tui";
import { buildMarchCommands, MarchAutocompleteProvider } from "./autocomplete.mjs";
import { OutputBuffer } from "./output-buffer.mjs";

export { buildMarchCommands, MarchAutocompleteProvider } from "./autocomplete.mjs";

const SPINNER_INTERVAL = 80;

function extractToolOutput(result) {
  try {
    const content = result?.content;
    if (Array.isArray(content)) {
      return content.filter(c => c.type === "text").map(c => c.text).join("\n");
    }
  } catch {}
  return "";
}

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

// ── TUI-based UI ────────────────────────────────────────────────────

function createTuiUI({ cwd = process.cwd(), skillPool = [] } = {}) {
  const terminal = new ProcessTerminal();
  const tui = new TUI(terminal);
  const output = new OutputBuffer();
  const editor = new Editor(tui, EDITOR_THEME, { paddingX: 1 });
  const autocomplete = new MarchAutocompleteProvider(buildMarchCommands(skillPool), cwd);
  editor.setAutocompleteProvider(autocomplete);

  tui.addChild(output);
  tui.addChild(editor);
  tui.setFocus(editor);

  let spinnerTimer = null;
  let retryTimer = null;
  let started = false;
  let mouseOn = false;
  let toolsExpanded = false;

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

  function stopRetryTimer() {
    if (retryTimer) {
      clearInterval(retryTimer);
      retryTimer = null;
    }
  }

  let onEscapeHandler = null;
  let onShiftTabHandler = null;
  let onCtrlTHandler = null;
  let onCtrlLHandler = null;

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
        // Ctrl+T: cycle thinking level (first slice of thinking selector)
        if (data === "\x14" && onCtrlTHandler) {
          onCtrlTHandler();
          return { consume: true };
        }
        // Ctrl+L: cycle model (first slice of model selector)
        if (data === "\x0c" && onCtrlLHandler) {
          onCtrlLHandler();
          return { consume: true };
        }
        // Ctrl+G: open external editor
        if (data === "\x07") {
          openExternalEditor();
          return { consume: true };
        }
        // Ctrl+O: toggle tool output expansion
        if (data === "\x0f") {
          toggleToolOutput();
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

  function toggleToolOutput() {
    toolsExpanded = !toolsExpanded;
    output.writeln(`\x1b[90m● tool output: ${toolsExpanded ? "expanded" : "collapsed"}\x1b[0m`);
    requestRender();
    return toolsExpanded;
  }

  function retryStart({ attempt, maxAttempts, delayMs, errorMessage }) {
    ensureStarted();
    stopSpinner();
    stopRetryTimer();
    const startedAt = Date.now();
    const message = () => {
      const remainingMs = Math.max(0, delayMs - (Date.now() - startedAt));
      const seconds = Math.ceil(remainingMs / 1000);
      return `Retrying (${attempt}/${maxAttempts}) in ${seconds}s... Esc to cancel`;
    };
    output.writeln(`\x1b[33m● retrying after error: ${String(errorMessage || "Unknown error").slice(0, 160)}\x1b[0m`);
    output.setSpinner(true, message());
    retryTimer = setInterval(() => {
      output.setSpinner(true, message());
      output.tick();
      requestRender();
    }, 250);
    requestRender();
  }

  function retryEnd({ success, attempt, finalError }) {
    ensureStarted();
    stopRetryTimer();
    stopSpinner();
    if (success) {
      output.writeln(`\x1b[90m● retry recovered after ${attempt} attempt${attempt === 1 ? "" : "s"}\x1b[0m`);
    } else {
      output.writeln(`\x1b[31m● retry stopped after ${attempt} attempt${attempt === 1 ? "" : "s"}${finalError ? `: ${finalError}` : ""}\x1b[0m`);
    }
    requestRender();
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
          const limit = toolsExpanded ? 40 : 4;
          const show = lines.slice(0, limit);
          for (const line of show) {
            output.writeln(`\x1b[2m    ${line.slice(0, 120)}\x1b[0m`);
          }
          if (lines.length > limit) output.writeln(`\x1b[2m    … (${lines.length - limit} more lines)\x1b[0m`);
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
    retryStart,
    retryEnd,

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
    setCtrlTHandler: (fn) => { onCtrlTHandler = fn; },
    setCtrlLHandler: (fn) => { onCtrlLHandler = fn; },

    openExternalEditor: () => { openExternalEditor(); },
    toggleToolOutput,

    close: () => {
      stopSpinner();
      stopRetryTimer();
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
    retryStart: (event) => {
      stdout.write(JSON.stringify({ type: "retry_start", ...event }) + "\n");
    },
    retryEnd: (event) => {
      stdout.write(JSON.stringify({ type: "retry_end", ...event }) + "\n");
    },
    editDiff: (path, diffLines) => {
      stdout.write(JSON.stringify({ type: "edit_diff", path, diff: diffLines }) + "\n");
    },
    setEscapeHandler: () => {},
    setShiftTabHandler: () => {},
    setCtrlTHandler: () => {},
    setCtrlLHandler: () => {},
    openExternalEditor: () => {},
    toggleMouse: () => false,
    toggleToolOutput: () => false,
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
    retryStart: ({ attempt, maxAttempts, delayMs, errorMessage }) => {
      stdout.write(`\x1b[33m● retrying (${attempt}/${maxAttempts}) in ${Math.ceil(delayMs / 1000)}s: ${errorMessage || "Unknown error"}\x1b[0m\n`);
    },
    retryEnd: ({ success, attempt, finalError }) => {
      const status = success ? "recovered" : "stopped";
      stdout.write(`\x1b[90m● retry ${status} after ${attempt} attempt${attempt === 1 ? "" : "s"}${finalError ? `: ${finalError}` : ""}\x1b[0m\n`);
    },
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
    setCtrlTHandler: () => {},
    setCtrlLHandler: () => {},
    openExternalEditor: () => {},
    toggleMouse: () => false,
    toggleToolOutput: () => false,
    close: () => {},
  };
}

// ── Public API ──────────────────────────────────────────────────────

export function createUI({ json, cwd = process.cwd(), skillPool = [] }) {
  if (json) return createJsonUI();
  if (!stdout.isTTY) return createPlainUI();
  return createTuiUI({ cwd, skillPool });
}
