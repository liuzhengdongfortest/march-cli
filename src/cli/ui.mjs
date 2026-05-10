import { stdout } from "node:process";
import {
  Editor,
  ProcessTerminal,
  SelectList,
  TUI,
} from "@mariozechner/pi-tui";
import { resolveAttachmentTokens, uniqueAttachmentToken, withLeadingSpace } from "./attachment-tokens.mjs";
import { buildMarchCommands, MarchAutocompleteProvider } from "./autocomplete.mjs";
import { getExternalEditorCommand, openTextInExternalEditor } from "./external-editor.mjs";
import { createJsonUI, createPlainUI } from "./fallback-ui.mjs";
import { createKeybindingDispatcher } from "./keybinding-dispatch.mjs";
import { OutputBuffer } from "./output-buffer.mjs";
import { ShellDrawer } from "./shell-drawer.mjs";
import { StatusBar } from "./status-bar.mjs";
import { extractToolOutput } from "./tool-output.mjs";

export { buildMarchCommands, MarchAutocompleteProvider } from "./autocomplete.mjs";

const SPINNER_INTERVAL = 80;

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

export function createTuiUI({
  cwd = process.cwd(),
  skillPool = [],
  keybindings,
  promptTemplates = [],
  shellRuntime = null,
  terminal = new ProcessTerminal(),
} = {}) {
  const tui = new TUI(terminal);
  const output = new OutputBuffer();
  const shellDrawer = new ShellDrawer({ shellRuntime });
  const statusBar = new StatusBar();
  const editor = new Editor(tui, EDITOR_THEME, { paddingX: 1 });
  const autocomplete = new MarchAutocompleteProvider(buildMarchCommands(skillPool, promptTemplates), cwd);
  editor.setAutocompleteProvider(autocomplete);

  tui.addChild(output);
  tui.addChild(shellDrawer);
  tui.addChild(statusBar);
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
  let onCtrlCHandler = null;
  let onShiftTabHandler = null;
  let onCtrlTHandler = null;
  let onCtrlLHandler = null;
  let onPasteImageHandler = null;
  const keybindingDispatcher = createKeybindingDispatcher({
    keybindings,
    handlers: {
      abort: () => onEscapeHandler?.(),
      interrupt: () => onCtrlCHandler?.(),
      cycleThinking: () => onShiftTabHandler?.(),
      thinkingSelector: () => onCtrlTHandler?.(),
      modelSelector: () => onCtrlLHandler?.(),
      externalEditor: () => openExternalEditor(),
      toggleToolOutput: () => toggleToolOutput(),
      toggleShellDrawer: () => toggleShellDrawer(),
      nextShell: () => selectNextShell(),
      shellScrollUp: () => scrollShellDrawer(-1),
      shellScrollDown: () => scrollShellDrawer(1),
      pasteImage: () => onPasteImageHandler?.(),
    },
    isAutocompleteOpen: () => editor.isShowingAutocomplete(),
    hasOverlay: () => tui.hasOverlay(),
  });

  function ensureStarted() {
    if (!started) {
      tui.addInputListener((data) => {
        const dispatched = keybindingDispatcher.dispatch(data);
        if (dispatched) return dispatched;
        if (shellDrawer.isInputActive()) {
          shellDrawer.sendInput(data);
          requestRender();
          return { consume: true };
        }
      });
      tui.start();
      started = true;
    }
  }

  function openExternalEditor() {
    const editorCommand = getExternalEditorCommand();
    if (!editorCommand) {
      output.writeln(`\x1b[33m● No editor configured. Set $VISUAL or $EDITOR.\x1b[0m`);
      requestRender();
      return;
    }
    try {
      tui.stop();
      if (mouseOn) terminal.write("\x1b[?1002l\x1b[?1006l");
      const result = openTextInExternalEditor({ text: editor.getText(), editorCommand });
      if (result.ok) editor.setText(result.text);
      else output.writeln(`\x1b[33m● ${result.error}\x1b[0m`);
    } finally {
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

  function toggleShellDrawer() {
    const visible = shellDrawer.toggle();
    output.writeln(`\x1b[90m● shell drawer: ${visible ? "open" : "closed"}\x1b[0m`);
    requestRender();
    return visible;
  }

  function selectNextShell() {
    if (!shellDrawer.isVisible()) return false;
    const shell = shellDrawer.selectNextShell();
    if (shell) output.writeln(`\x1b[90m● shell: ${shell.name} (${shell.id})\x1b[0m`);
    requestRender();
    return shell;
  }

  function scrollShellDrawer(delta) {
    if (!shellDrawer.isVisible()) return false;
    const state = shellDrawer.scroll(delta);
    requestRender();
    return state;
  }

  function selectList({ items, selectedIndex = 0, maxVisible = 8, width = 64 }) {
    ensureStarted();
    if (!Array.isArray(items) || items.length === 0) return Promise.resolve(null);
    return new Promise((resolve) => {
      const list = new SelectList(items, maxVisible, EDITOR_THEME.selectList, {
        minPrimaryColumnWidth: 18,
        maxPrimaryColumnWidth: 32,
      });
      let settled = false;
      let handle = null;
      const finish = (item) => {
        if (settled) return;
        settled = true;
        if (handle) handle.hide();
        requestRender();
        resolve(item);
      };
      list.setSelectedIndex(selectedIndex);
      list.onSelect = (item) => finish(item);
      list.onCancel = () => finish(null);
      handle = tui.showOverlay(list, {
        width,
        minWidth: 40,
        maxHeight: maxVisible + 1,
        anchor: "bottom-center",
        margin: 1,
      });
      requestRender();
    });
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
  const attachmentTokens = new Map();

  return {
    readline: (_prompt) =>
      new Promise((resolve) => {
        ensureStarted();
        onSubmitResolve = resolve;
        editor.disableSubmit = false;
        editor.onSubmit = (text) => {
          const resolvedText = resolveAttachmentTokens(text, attachmentTokens);
          editor.addToHistory(text);
          editor.disableSubmit = true;
          editor.onSubmit = undefined;
          const res = onSubmitResolve;
          onSubmitResolve = null;
          attachmentTokens.clear();
          if (res) res(resolvedText);
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

    setStatusBar: (text) => {
      statusBar.setText(text);
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
    setCtrlCHandler: (fn) => { onCtrlCHandler = fn; },
    setShiftTabHandler: (fn) => { onShiftTabHandler = fn; },
    setCtrlTHandler: (fn) => { onCtrlTHandler = fn; },
    setCtrlLHandler: (fn) => { onCtrlLHandler = fn; },
    setPasteImageHandler: (fn) => { onPasteImageHandler = fn; },

    selectList,
    getInputText: () => editor.getText(),
    insertTextAtCursor: (text) => {
      editor.insertTextAtCursor(text);
      requestRender();
    },
    insertAttachmentAtCursor: ({ marker, label }) => {
      const token = uniqueAttachmentToken(label || "[image]", attachmentTokens);
      attachmentTokens.set(token, marker);
      editor.insertTextAtCursor(withLeadingSpace(editor.getText(), token));
      requestRender();
    },
    openExternalEditor: () => { openExternalEditor(); },
    toggleToolOutput,
    toggleShellDrawer,
    requestExit: () => {
      if (!onSubmitResolve) return;
      const res = onSubmitResolve;
      onSubmitResolve = null;
      attachmentTokens.clear();
      editor.disableSubmit = true;
      editor.onSubmit = undefined;
      res(null);
    },

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

// ── Public API ──────────────────────────────────────────────────────

export function createUI({ json, cwd = process.cwd(), skillPool = [], keybindings, promptTemplates = [], shellRuntime = null } = {}) {
  if (json) return createJsonUI();
  if (!stdout.isTTY) return createPlainUI();
  return createTuiUI({ cwd, skillPool, keybindings, promptTemplates, shellRuntime });
}
