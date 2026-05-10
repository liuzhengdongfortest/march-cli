import { stdout } from "node:process";
import {
  Editor,
  ProcessTerminal,
  TUI,
} from "@mariozechner/pi-tui";
import { resolveAttachmentTokens, uniqueAttachmentToken, withLeadingSpace } from "./attachment-tokens.mjs";
import { buildMarchCommands, MarchAutocompleteProvider } from "./autocomplete.mjs";
import { getExternalEditorCommand, openTextInExternalEditor } from "./external-editor.mjs";
import { createJsonUI, createPlainUI } from "./fallback-ui.mjs";
import { createKeybindingDispatcher } from "./keybinding-dispatch.mjs";
import { OutputBuffer } from "./output-buffer.mjs";
import { createRetryStatusController } from "./retry-status.mjs";
import { createShellDrawerControls } from "./shell-drawer-controls.mjs";
import { ShellDrawer } from "./shell-drawer.mjs";
import { showSelectListOverlay } from "./select-list-overlay.mjs";
import { createSpinnerStatusController } from "./spinner-status.mjs";
import { StatusBar } from "./status-bar.mjs";
import { writeEditDiff } from "./tui-diff-rendering.mjs";
import { writeToolEnd, writeToolStart } from "./tool-rendering.mjs";
import { EDITOR_THEME } from "./ui-theme.mjs";

export { buildMarchCommands, MarchAutocompleteProvider } from "./autocomplete.mjs";

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

  let started = false;
  let mouseOn = false;
  let toolsExpanded = false;

  function requestRender() {
    tui.requestRender();
  }

  const spinnerStatus = createSpinnerStatusController({ output, requestRender });
  const retryStatus = createRetryStatusController({ output, requestRender, stopSpinner: spinnerStatus.stop });
  const shellDrawerControls = createShellDrawerControls({ shellDrawer, output, requestRender });

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
      toggleShellDrawer: () => shellDrawerControls.toggle(),
      nextShell: () => shellDrawerControls.selectNext(),
      shellScrollUp: () => shellDrawerControls.scroll(-1),
      shellScrollDown: () => shellDrawerControls.scroll(1),
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

  function selectList({ items, selectedIndex = 0, maxVisible = 8, width = 64 }) {
    ensureStarted();
    return showSelectListOverlay({ tui, items, selectedIndex, maxVisible, width, requestRender });
  }

  function retryStart({ attempt, maxAttempts, delayMs, errorMessage }) {
    ensureStarted();
    retryStatus.start({ attempt, maxAttempts, delayMs, errorMessage });
  }

  function retryEnd({ success, attempt, finalError }) {
    ensureStarted();
    retryStatus.end({ success, attempt, finalError });
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
      spinnerStatus.stop();
      writeToolStart({ output, name, args });
      requestRender();
    },

    toolEnd: (name, isError, result) => {
      if (writeToolEnd({ output, name, isError, result, toolsExpanded })) {
        requestRender();
      }
    },

    textDelta: (delta) => {
      ensureStarted();
      spinnerStatus.stop();
      output.write(delta);
      requestRender();
    },

    status: (text) => {
      ensureStarted();
      spinnerStatus.stop();
      output.writeln(`\x1b[90m● ${text}\x1b[0m`);
      requestRender();
    },

    setStatusBar: (text) => {
      statusBar.setText(text);
      requestRender();
    },

    turnStart: () => {
      ensureStarted();
      spinnerStatus.start("Thinking...");
    },

    turnEnd: () => {
      spinnerStatus.stop();
    },

    summaryStart: () => {
      spinnerStatus.start("summarizing...");
    },

    summaryDone: () => {
      spinnerStatus.stop();
      output.writeln("");
      output.writeln(`\x1b[90m● summary · done\x1b[0m`);
      requestRender();
    },
    retryStart,
    retryEnd,

    editDiff: (path, diffLines) => {
      ensureStarted();
      spinnerStatus.stop();
      writeEditDiff({ output, path, diffLines });
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
    toggleShellDrawer: () => shellDrawerControls.toggle(),
    requestExit: () => {
      if (!onSubmitResolve) return;
      const res = onSubmitResolve;
      onSubmitResolve = null;
      attachmentTokens.clear();
      editor.disableSubmit = true;
      editor.onSubmit = undefined;
      res(null);
    },

    close: async () => {
      spinnerStatus.stop();
      retryStatus.stop();
      if (started) {
        await terminal.drainInput?.();
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
