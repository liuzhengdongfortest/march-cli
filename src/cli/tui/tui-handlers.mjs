import { buildModelSelectItems, persistModelSelection } from "../commands/model-command.mjs";
import { pasteClipboardImage } from "../commands/paste-image-command.mjs";
import { buildThinkingSelectItems } from "../commands/thinking-command.mjs";
import { brightBlack } from "./ui-theme.mjs";

export function wireTuiHandlers({
  ui,
  runner,
  sessionState,
  projectMarchDir,
  refreshStatusBar = () => {},
  isTurnRunning = () => false,
  modeState = null,
  pasteClipboardImageImpl = pasteClipboardImage,
  configHomeDir,
} = {}) {
  let lastIdleCtrlCAt = 0;
  ui.setEscapeHandler(() => {
    lastIdleCtrlCAt = 0;
    if (isTurnRunning()) {
      runner.abort();
      refreshStatusBar.markAborted?.();
    }
  });
  ui.setCtrlCHandler?.(() => {
    if (isTurnRunning()) {
      lastIdleCtrlCAt = 0;
      runner.abort();
      refreshStatusBar.markAborted?.();
      return;
    }
    const now = Date.now();
    if (now - lastIdleCtrlCAt > 2000) {
      lastIdleCtrlCAt = now;
      ui.status?.("press Ctrl+C again to exit");
      return;
    }
    ui.requestExit?.();
  });

  const selectThinkingLevel = async () => {
    try {
      const levels = runner.getAvailableThinkingLevels?.() || [];
      if (!ui.selectList || levels.length === 0) {
        ui.writeln(brightBlack(`● thinking: no selector available`));
        return;
      }
      const current = runner.getThinkingLevel?.();
      const selectedIndex = Math.max(0, levels.indexOf(current));
      const item = await ui.selectList({
        items: buildThinkingSelectItems(levels, current),
        selectedIndex,
        width: 48,
      });
      if (!item) {
        ui.writeln(brightBlack(`● thinking: unchanged`));
        return;
      }
      ui.writeln(brightBlack(`● thinking: ${runner.setThinkingLevel(item.level)}`));
      refreshStatusBar();
    } catch (err) {
      ui.writeln(`Error: ${err.message}`);
    }
  };

  ui.setShiftTabHandler(selectThinkingLevel);
  ui.setToggleModeHandler?.(() => {
    const mode = modeState?.toggle?.();
    if (!mode) return;
    refreshStatusBar();
  });
  ui.setCtrlTHandler(selectThinkingLevel);

  ui.setCtrlLHandler(async () => {
    try {
      const scopedModels = runner.getScopedModels?.() || [];
      if (ui.selectList && scopedModels.length > 0) {
        const current = runner.getCurrentModel?.();
        const items = buildModelSelectItems({ current, scopedModels });
        const selectedIndex = Math.max(0, items.findIndex((item) =>
          current && item.model.id === current.id && item.model.provider === current.provider
        ));
        const selectedItem = await ui.selectList({
          items,
          selectedIndex,
          width: 72,
        });
        if (!selectedItem) {
          ui.writeln(brightBlack(`● model: unchanged`));
          return;
        }
        const model = await runner.setModel(selectedItem.model);
        persistModelSelection(model, { configHomeDir });
        const name = model.name || model.id;
        ui.writeln(brightBlack(`● model: ${name} (${model.provider})`));
        refreshStatusBar();
        return;
      }
      ui.writeln(brightBlack(`● model: no selector available`));
    } catch (err) {
      ui.writeln(`Error: ${err.message}`);
    }
  });

  ui.setPasteImageHandler(() => {
    const sessionId = runner.getSessionStats?.().sessionId ?? sessionState.sessionId;
    for (const line of pasteClipboardImageImpl({ ui, projectMarchDir, sessionId })) {
      ui.status(line);
    }
  });
}
