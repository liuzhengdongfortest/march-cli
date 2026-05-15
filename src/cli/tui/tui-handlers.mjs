import { buildModelSelectItems } from "../commands/model-command.mjs";
import { pasteClipboardImage } from "../commands/paste-image-command.mjs";
import { buildThinkingSelectItems } from "../commands/thinking-command.mjs";
import { yellow, brightBlack } from "./ui-theme.mjs";

export function wireTuiHandlers({
  ui,
  runner,
  sessionState,
  projectMarchDir,
  refreshStatusBar = () => {},
  isTurnRunning = () => false,
  modeState = null,
  pasteClipboardImageImpl = pasteClipboardImage,
} = {}) {
  ui.setEscapeHandler(() => {
    if (isTurnRunning()) {
      runner.abort();
      ui.writeln(yellow(`● aborted`));
    }
  });
  ui.setCtrlCHandler?.(() => {
    if (isTurnRunning()) {
      runner.abort();
      ui.writeln(yellow(`● aborted`));
      return;
    }
    ui.requestExit?.();
  });

  const cycleThinkingLevel = () => {
    const level = runner.cycleThinkingLevel();
    if (level) {
      ui.writeln(brightBlack(`● thinking: ${level}`));
      refreshStatusBar();
    }
  };

  ui.setShiftTabHandler(cycleThinkingLevel);
  ui.setToggleModeHandler?.(() => {
    const mode = modeState?.toggle?.();
    if (!mode) return;
    refreshStatusBar();
  });
  ui.setCtrlTHandler(async () => {
    try {
      const levels = runner.getAvailableThinkingLevels?.() || [];
      if (ui.selectList && levels.length > 0) {
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
        return;
      }
      cycleThinkingLevel();
    } catch (err) {
      ui.writeln(`Error: ${err.message}`);
    }
  });

  ui.setCtrlLHandler(async () => {
    try {
      const scopedModels = runner.getScopedModels?.() || [];
      if (ui.selectList && scopedModels.length > 0) {
        const current = runner.getCurrentModel?.();
        const selectedIndex = Math.max(0, scopedModels.findIndex(({ model }) =>
          current && model.id === current.id && model.provider === current.provider
        ));
        const item = await ui.selectList({
          items: buildModelSelectItems({ current, scopedModels }),
          selectedIndex,
          width: 72,
        });
        if (!item) {
          ui.writeln(brightBlack(`● model: unchanged`));
          return;
        }
        const model = await runner.setModel(item.model);
        const name = model.name || model.id;
        ui.writeln(brightBlack(`● model: ${name} (${model.provider})`));
        refreshStatusBar();
        return;
      }
      const result = await runner.cycleModel();
      if (result) {
        const name = result.model.name || result.model.id;
        ui.writeln(brightBlack(`● model: ${name} (${result.model.provider})  thinking: ${result.thinkingLevel}`));
        refreshStatusBar();
      } else {
        ui.writeln(brightBlack(`● model: only one available`));
      }
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
