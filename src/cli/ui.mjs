import { stdout } from "node:process";
import { Editor, ProcessTerminal, TUI } from "@earendil-works/pi-tui";
import { writeSystemClipboardAsync } from "./commands/copy-command.mjs";
import { buildMarchCommands, MarchAutocompleteProvider } from "./input/autocomplete.mjs";
import { createJsonUI, createPlainUI } from "./fallback-ui.mjs";
import { createKeybindingDispatcher } from "./input/keybinding-dispatch.mjs";
import { OutputBuffer } from "./tui/output-buffer.mjs";
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
import { createHistoryNavigationController } from "./tui/input/history-navigation-controller.mjs";
import { createMouseSelectionController } from "./tui/input/mouse-selection-controller.mjs";
import { ScreenSelection } from "./tui/selection-screen.mjs";
import { writeEditDiff } from "./tui/tui-diff-rendering.mjs";
import { createTuiInputController } from "./tui/tui-input-controller.mjs";
import { writeRecall } from "./tui/recall-rendering.mjs";
import { writeToolEnd, writeToolStart } from "./tui/tool-rendering.mjs";
import { EDITOR_THEME, brightBlack } from "./tui/ui-theme.mjs";
import { createRenderScheduler } from "./tui/render/render-scheduler.mjs";
import { createStreamDeltaBuffer } from "./tui/render/stream-delta-buffer.mjs";
import { writeTranscriptToOutput } from "../session/transcript.mjs";

export { buildMarchCommands, MarchAutocompleteProvider } from "./input/autocomplete.mjs";

export function createTuiUI({
  cwd = process.cwd(),
  keybindings,
  promptTemplates = [],
  shellRuntime = null,
  historyStore = null,
  terminal = new ProcessTerminal(),
  writeClipboard = writeSystemClipboardAsync,
} = {}) {
  const tui = new TUI(terminal);
  const output = new OutputBuffer();
  const shellDrawer = new ShellDrawer({ shellRuntime });
  const statusBar = new StatusBar(undefined, { cwd });
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
  let toolsExpanded = false;
  const activeToolBlocks = [];
  const renderScheduler = createRenderScheduler({ requestRender: () => tui.requestRender() });
  const streamDeltas = createStreamDeltaBuffer({ writeText: (delta) => output.writeMarkdown(delta), writeThinking: (delta) => output.appendThinking(delta), renderSoon: renderScheduler.renderSoon });
  const flushStreamDeltas = () => streamDeltas.flush({ notify: false });
  const requestRender = () => { flushStreamDeltas(); renderScheduler.renderNow(); };
  const spinnerStatus = createSpinnerStatusController({ output, requestRender });
  const retryStatus = createRetryStatusController({ output, requestRender, stopSpinner: spinnerStatus.stop });
  const shellDrawerControls = createShellDrawerControls({ shellDrawer, output, requestRender });
  const mouseSelectionController = createMouseSelectionController({ terminal, output, shellDrawer, shellDrawerControls, selection, writeClipboard, requestRender });
  const historyNavigationController = createHistoryNavigationController({
    editor,
    requestRender,
    isAutocompleteOpen: () => editor.isShowingAutocomplete(),
    hasOverlay: () => tui.hasOverlay(),
  });

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
        const mouseResult = mouseSelectionController.handleMouseInput(data);
        if (mouseResult) return mouseResult;
        const copyKeyResult = mouseSelectionController.handleCopyKey(data);
        if (copyKeyResult) return copyKeyResult;
        const dispatched = keybindingDispatcher.dispatch(data);
        if (dispatched) return dispatched;
        if (shellDrawer.isInputActive()) {
          shellDrawer.sendInput(data);
          requestRender();
          return { consume: true };
        }
        const historyNavigationResult = historyNavigationController.handleInput(data);
        if (historyNavigationResult) return historyNavigationResult;
      });
      terminal.write("\x1b[?1049h");
      terminal.write("\x1b[?1002h\x1b[?1006h");
      tui.start();
      started = true;
    }
  }

  function openExternalEditor() {
    runTuiExternalEditor({ terminal, tui, editor, output, requestRender, mouseOn: () => true });
  }

  function toggleToolOutput() {
    toolsExpanded = !toolsExpanded;
    output.setToolCardsExpanded(toolsExpanded);
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

  const resetOutputScrollOnSubmit = () => {
    if (output.scrollOffset <= 0) return;
    output.resetScroll();
    requestRender();
  };
  const inputController = createTuiInputController({ editor, requestRender, historyStore, onSubmit: resetOutputScrollOnSubmit });

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

    thinkingDelta: (delta) => streamDeltas.thinking(delta),

    thinkingEnd: (tokens) => {
      flushStreamDeltas();
      output.endThinking(tokens);
      requestRender();
    },

    thinkingBlock: (tokens, content) => {
      retryStatus.stop(); output.addThinkingBlock(tokens, content); requestRender();
    },

    toggleLastThinking: () => false,

    toolStart: (name, args) => {
      ensureStarted(); flushStreamDeltas(); retryStatus.stop(); spinnerStatus.stop(); activeToolBlocks.push(writeToolStart({ output, name, args })); requestRender();
    },

    toolEnd: (name, isError, result) => {
      if (writeToolEnd({ output, name, isError, result, toolsExpanded, toolBlock: activeToolBlocks.pop() })) requestRender();
    },

    textDelta: (delta) => {
      ensureStarted(); retryStatus.stop(); spinnerStatus.stop(); streamDeltas.text(delta);
    },
    assistantReplyEnd: () => {
      ensureStarted();
      flushStreamDeltas();
      const changed = output.ensureNewline();
      if (output.sealCurrentText() || changed) requestRender();
    },
    status: (text) => {
      ensureStarted(); flushStreamDeltas(); retryStatus.stop(); spinnerStatus.stop(); output.setOverlayStatus([brightBlack(`● ${text}`)]); requestRender();
    },
    recall: ({ hints }) => {
      ensureStarted(); flushStreamDeltas(); retryStatus.stop(); spinnerStatus.stop(); output.ensureNewline(); writeRecall({ output, hints }); requestRender();
    },

    clearOutput: () => {
      ensureStarted(); flushStreamDeltas(); spinnerStatus.stop(); retryStatus.stop(); output.clear(); requestRender();
    },
    restoreTranscript: (turns) => {
      ensureStarted(); flushStreamDeltas(); spinnerStatus.stop(); retryStatus.stop(); output.clear(); writeTranscriptToOutput(output, turns); requestRender();
    },

    setStatusBar: (text) => {
      if (statusBar.setText(text)) requestRender();
    },

    turnStart: () => {
      ensureStarted();
    },

    turnEnd: () => {
      flushStreamDeltas();
      const changed = output.ensureNewline();
      if (output.sealCurrentText() || changed) requestRender();
    },

    retryStart,
    retryEnd,

    editDiff: (path, diffLines) => {
      ensureStarted();
      flushStreamDeltas();
      spinnerStatus.stop();
      writeEditDiff({ output, path, diffLines });
      requestRender();
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
      flushStreamDeltas();
      renderScheduler.clearPending();
      spinnerStatus.stop();
      retryStatus.stop();
      if (started) {
        await terminal.drainInput?.();
        terminal.write("\x1b[?1002l\x1b[?1006l");
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
