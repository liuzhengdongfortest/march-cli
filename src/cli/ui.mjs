import { stdout } from "node:process";
import { Editor, ProcessTerminal, TUI } from "@earendil-works/pi-tui";
import { buildMarchCommands, MarchAutocompleteProvider } from "./input/autocomplete.mjs";
import { getExternalEditorCommand, openTextInExternalEditor } from "./input/external-editor.mjs";
import { createJsonUI, createPlainUI } from "./fallback-ui.mjs";
import { createKeybindingDispatcher } from "./input/keybinding-dispatch.mjs";
import { OutputBuffer } from "./tui/output-buffer.mjs";
import { requestToolPermission } from "./tui/permission-request-ui.mjs";
import { createRetryStatusController } from "./tui/status/retry-status.mjs";
import { createShellDrawerControls } from "./shell/shell-drawer-controls.mjs";
import { ShellDrawer } from "./shell/shell-drawer.mjs";
import { ShellSplitLayout } from "./shell/shell-split-layout.mjs";
import { createSpinnerStatusController } from "./tui/status/spinner-status.mjs";
import { showEditorSelectList } from "./tui/select/editor-select-list.mjs";
import { StatusBar } from "./tui/status/status-bar.mjs";
import { writeEditDiff } from "./tui/tui-diff-rendering.mjs";
import { createTuiInputController } from "./tui/tui-input-controller.mjs";
import { writeMemoryHint } from "./tui/recall-rendering.mjs";
import { writeToolEnd, writeToolStart } from "./tui/tool-rendering.mjs";
import { EDITOR_THEME, yellow, brightBlack } from "./tui/ui-theme.mjs";

export { buildMarchCommands, MarchAutocompleteProvider } from "./input/autocomplete.mjs";

export function createTuiUI({
  cwd = process.cwd(),
  keybindings,
  promptTemplates = [],
  shellRuntime = null,
  historyStore = null,
  terminal = new ProcessTerminal(),
} = {}) {
  const tui = new TUI(preserveTerminalScrollback(terminal));
  const output = new OutputBuffer();
  const shellDrawer = new ShellDrawer({ shellRuntime });
  const statusBar = new StatusBar();
  const editor = new Editor(tui, EDITOR_THEME, { paddingX: 1 });
  const shellSplitLayout = new ShellSplitLayout({
    mainChildren: [output, statusBar, editor],
    shellPane: shellDrawer,
  });
  const autocomplete = new MarchAutocompleteProvider(buildMarchCommands(promptTemplates), cwd);
  editor.setAutocompleteProvider(autocomplete);
  editor.history = historyStore?.load?.() ?? [];

  tui.addChild(shellSplitLayout);
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

  let onEscapeHandler = null, onCtrlCHandler = null, onShiftTabHandler = null;
  let onCtrlTHandler = null, onCtrlLHandler = null, onPasteImageHandler = null, onToggleModeHandler = null;
  const keybindingDispatcher = createKeybindingDispatcher({
    keybindings,
    handlers: {
      abort: () => onEscapeHandler?.(),
      interrupt: () => onCtrlCHandler?.(),
      toggleMode: () => onToggleModeHandler?.(),
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
      output.writeln(yellow(`● No editor configured. Set $VISUAL or $EDITOR.`));
      requestRender();
      return;
    }
    try {
      tui.stop();
      if (mouseOn) terminal.write("\x1b[?1002l\x1b[?1006l");
      const result = openTextInExternalEditor({ text: editor.getText(), editorCommand });
      if (result.ok) editor.setText(result.text);
      else output.writeln(yellow(`● ${result.error}`));
    } finally {
      tui.start();
      if (mouseOn) terminal.write("\x1b[?1002h\x1b[?1006h");
      tui.requestRender(true);
    }
  }

  function toggleToolOutput() {
    toolsExpanded = !toolsExpanded;
    output.writeln(brightBlack(`● tool output: ${toolsExpanded ? "expanded" : "collapsed"}`));
    requestRender();
    return toolsExpanded;
  }

  function selectList({ items, selectedIndex = 0, maxVisible = 8, ...options }) {
    ensureStarted();
    return showEditorSelectList({ tui, editor, items, selectedIndex, maxVisible, requestRender, ...options });
  }

  function retryStart({ attempt, maxAttempts, delayMs, errorMessage }) {
    ensureStarted();
    retryStatus.start({ attempt, maxAttempts, delayMs, errorMessage });
  }

  function retryEnd({ success, attempt, finalError }) {
    ensureStarted();
    retryStatus.end({ success, attempt, finalError });
  }

  const inputController = createTuiInputController({ editor, requestRender, historyStore });

  return {
    readline: (_prompt) => {
      ensureStarted();
      return inputController.readline();
    },

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
      retryStatus.stop(); output.startThinking(); requestRender();
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
      retryStatus.stop(); output.addThinkingBlock(tokens, content); requestRender();
    },

    toggleLastThinking: () => false,

    toolStart: (name, args) => {
      ensureStarted(); retryStatus.stop(); spinnerStatus.stop(); writeToolStart({ output, name, args }); requestRender();
    },

    toolEnd: (name, isError, result) => {
      if (writeToolEnd({ output, name, isError, result, toolsExpanded })) {
        requestRender();
      }
    },

    textDelta: (delta) => {
      ensureStarted(); retryStatus.stop(); spinnerStatus.stop();
      output.writeMarkdown(delta);
      requestRender();
    },
    assistantReplyEnd: () => {
      ensureStarted();
      const changed = output.ensureNewline();
      if (output.sealCurrentText() || changed) requestRender();
    },
    status: (text) => {
      ensureStarted(); retryStatus.stop(); spinnerStatus.stop(); output.setOverlayStatus([brightBlack(`● ${text}`)]); requestRender();
    },
    memoryHint: ({ hints }) => {
      ensureStarted(); retryStatus.stop(); spinnerStatus.stop(); output.ensureNewline(); writeMemoryHint({ output, hints }); requestRender();
    },

    clearOutput: () => {
      ensureStarted(); spinnerStatus.stop(); retryStatus.stop(); output.clear(); requestRender();
    },

    setStatusBar: (text) => {
      if (statusBar.setText(text)) requestRender();
    },

    turnStart: () => {
      ensureStarted();
    },

    turnEnd: () => {
      const changed = output.ensureNewline();
      if (output.sealCurrentText() || changed) requestRender();
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

    requestPermission: async ({ toolName, params, category }) => {
      ensureStarted();
      spinnerStatus.stop();
      return requestToolPermission({ toolName, params, category, output, selectList, requestRender });
    },

    setEscapeHandler: (fn) => { onEscapeHandler = fn; },
    setCtrlCHandler: (fn) => { onCtrlCHandler = fn; },
    setShiftTabHandler: (fn) => { onShiftTabHandler = fn; },
    setCtrlTHandler: (fn) => { onCtrlTHandler = fn; },
    setCtrlLHandler: (fn) => { onCtrlLHandler = fn; },
    setPasteImageHandler: (fn) => { onPasteImageHandler = fn; },
    setToggleModeHandler: (fn) => { onToggleModeHandler = fn; },

    selectList,
    getInputText: () => inputController.getInputText(),
    insertTextAtCursor: (text) => inputController.insertTextAtCursor(text),
    insertAttachmentAtCursor: (attachment) => inputController.insertAttachmentAtCursor(attachment),
    openExternalEditor: () => { openExternalEditor(); },
    toggleToolOutput,
    toggleShellDrawer: () => shellDrawerControls.toggle(),
    requestExit: () => inputController.requestExit(),

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

function preserveTerminalScrollback(terminal) {
  return new Proxy(terminal, {
    get(target, prop, receiver) {
      if (prop === "write") {
        return (data) => target.write(String(data).replaceAll("\x1b[3J", ""));
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

export function createUI({ json, cwd = process.cwd(), keybindings, promptTemplates = [], shellRuntime = null, historyStore = null } = {}) {
  if (json) return createJsonUI();
  if (!stdout.isTTY) return createPlainUI();
  return createTuiUI({ cwd, keybindings, promptTemplates, shellRuntime, historyStore });
}
