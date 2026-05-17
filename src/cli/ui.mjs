import { stdout } from "node:process";
import { Editor, ProcessTerminal, TUI } from "@earendil-works/pi-tui";
import { writeSystemClipboard } from "./commands/copy-command.mjs";
import { buildMarchCommands, MarchAutocompleteProvider } from "./input/autocomplete.mjs";
import { createJsonUI, createPlainUI } from "./fallback-ui.mjs";
import { createKeybindingDispatcher } from "./input/keybinding-dispatch.mjs";
import { OutputBuffer } from "./tui/output-buffer.mjs";
import { requestToolPermission } from "./tui/permission-request-ui.mjs";
import { runTuiExternalEditor } from "./tui/editor/external-editor-runner.mjs";
import { createRetryStatusController } from "./tui/status/retry-status.mjs";
import { createShellDrawerControls } from "./shell/shell-drawer-controls.mjs";
import { ShellDrawer } from "./shell/shell-drawer.mjs";
import { ShellSplitLayout } from "./shell/shell-split-layout.mjs";
import { createSpinnerStatusController } from "./tui/status/spinner-status.mjs";
import { showEditorSelectList } from "./tui/select/editor-select-list.mjs";
import { StatusBar } from "./tui/status/status-bar.mjs";
import { MainPaneLayout } from "./tui/layout/main-pane-layout.mjs";
import { SafeRenderBoundary } from "./tui/layout/safe-render-boundary.mjs";
import { createMouseSelectionController } from "./tui/input/mouse-selection-controller.mjs";
import { ScreenSelection } from "./tui/selection-screen.mjs";
import { writeEditDiff } from "./tui/tui-diff-rendering.mjs";
import { createTuiInputController } from "./tui/tui-input-controller.mjs";
import { writeMemoryHint } from "./tui/recall-rendering.mjs";
import { writeToolEnd, writeToolStart } from "./tui/tool-rendering.mjs";
import { EDITOR_THEME, brightBlack } from "./tui/ui-theme.mjs";
import { formatTranscriptLines } from "../session/transcript.mjs";

export { buildMarchCommands, MarchAutocompleteProvider } from "./input/autocomplete.mjs";

export function createTuiUI({
  cwd = process.cwd(),
  keybindings,
  promptTemplates = [],
  shellRuntime = null,
  historyStore = null,
  terminal = new ProcessTerminal(),
  writeClipboard = writeSystemClipboard,
} = {}) {
  const tui = new TUI(terminal);
  const output = new OutputBuffer();
  const shellDrawer = new ShellDrawer({ shellRuntime });
  const statusBar = new StatusBar();
  const editor = new Editor(tui, EDITOR_THEME, { paddingX: 1 });
  const selection = new ScreenSelection();
  const mainPane = new MainPaneLayout({ output, statusBar, editor, terminal, selection });
  const shellSplitLayout = new ShellSplitLayout({
    mainChildren: [mainPane],
    shellPane: shellDrawer,
    selection,
  });
  const autocomplete = new MarchAutocompleteProvider(buildMarchCommands(promptTemplates), cwd);
  editor.setAutocompleteProvider(autocomplete);
  editor.history = historyStore?.load?.() ?? [];

  tui.addChild(new SafeRenderBoundary(shellSplitLayout));
  tui.setFocus(editor);

  let started = false;
  let mouseOn = true;
  let toolsExpanded = false;

  function requestRender() {
    tui.requestRender();
  }

  const spinnerStatus = createSpinnerStatusController({ output, requestRender });
  const retryStatus = createRetryStatusController({ output, requestRender, stopSpinner: spinnerStatus.stop });
  const shellDrawerControls = createShellDrawerControls({ shellDrawer, output, requestRender });
  const mouseSelectionController = createMouseSelectionController({ terminal, output, shellDrawer, shellDrawerControls, selection, writeClipboard, requestRender });

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
      outputScrollUp: () => { output.scroll(-1); requestRender(); },
      outputScrollDown: () => { output.scroll(1); requestRender(); },
      pasteImage: () => onPasteImageHandler?.(),
    },
    isAutocompleteOpen: () => editor.isShowingAutocomplete(),
    hasOverlay: () => tui.hasOverlay(),
  });

  function ensureStarted() {
    if (!started) {
      tui.addInputListener((data) => {
        const mouseResult = mouseSelectionController.handleMouseInput(data, mouseOn);
        if (mouseResult) return mouseResult;
        const copyKeyResult = mouseSelectionController.handleCopyKey(data);
        if (copyKeyResult) return copyKeyResult;
        const dispatched = keybindingDispatcher.dispatch(data);
        if (dispatched) return dispatched;
        // When output is scrolled up, the next render has fewer lines.
        // On new input, reset scroll to tail so the editor stays at bottom.
        if (output.scrollOffset > 0) {
          output.resetScroll();
          requestRender();
        }
        if (shellDrawer.isInputActive()) {
          shellDrawer.sendInput(data);
          requestRender();
          return { consume: true };
        }
      });
      terminal.write("\x1b[?1049h");
      terminal.write("\x1b[?1002h\x1b[?1006h");
      tui.start();
      started = true;
    }
  }

  function openExternalEditor() {
    runTuiExternalEditor({ terminal, tui, editor, output, requestRender, mouseOn: () => mouseOn });
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

    restoreTranscript: (turns) => {
      ensureStarted(); spinnerStatus.stop(); retryStatus.stop(); output.clear();
      for (const line of formatTranscriptLines(turns)) output.writeln(line);
      requestRender();
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
        terminal.write("\x1b[?1049l");
      }
    },
  };
}

export function createUI({ json, cwd = process.cwd(), keybindings, promptTemplates = [], shellRuntime = null, historyStore = null } = {}) {
  if (json) return createJsonUI();
  if (!stdout.isTTY) return createPlainUI();
  return createTuiUI({ cwd, keybindings, promptTemplates, shellRuntime, historyStore });
}
