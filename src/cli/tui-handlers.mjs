import { buildModelSelectItems } from "./model-command.mjs";
import { pasteClipboardImage } from "./paste-image-command.mjs";
import { buildThinkingSelectItems } from "./thinking-command.mjs";

export function wireTuiHandlers({
  ui,
  runner,
  sessionState,
  projectMarchDir,
  refreshStatusBar = () => {},
  isTurnRunning = () => false,
} = {}) {
  ui.setEscapeHandler(() => {
    if (isTurnRunning()) {
      runner.abort();
      ui.writeln(`\x1b[33m● aborted\x1b[0m`);
    }
  });

  const cycleThinkingLevel = () => {
    const level = runner.cycleThinkingLevel();
    if (level) {
      ui.writeln(`\x1b[90m● thinking: ${level}\x1b[0m`);
      refreshStatusBar();
    }
  };

  ui.setShiftTabHandler(cycleThinkingLevel);
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
          ui.writeln(`\x1b[90m● thinking: unchanged\x1b[0m`);
          return;
        }
        ui.writeln(`\x1b[90m● thinking: ${runner.setThinkingLevel(item.level)}\x1b[0m`);
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
          ui.writeln(`\x1b[90m● model: unchanged\x1b[0m`);
          return;
        }
        const model = await runner.setModel(item.model);
        const name = model.name || model.id;
        ui.writeln(`\x1b[90m● model: ${name} (${model.provider})\x1b[0m`);
        refreshStatusBar();
        return;
      }
      const result = await runner.cycleModel();
      if (result) {
        const name = result.model.name || result.model.id;
        ui.writeln(`\x1b[90m● model: ${name} (${result.model.provider})  thinking: ${result.thinkingLevel}\x1b[0m`);
        refreshStatusBar();
      } else {
        ui.writeln(`\x1b[90m● model: only one available\x1b[0m`);
      }
    } catch (err) {
      ui.writeln(`Error: ${err.message}`);
    }
  });

  ui.setPasteImageHandler(() => {
    const sessionId = runner.getSessionStats?.().sessionId ?? sessionState.sessionId;
    for (const line of pasteClipboardImage({ ui, projectMarchDir, sessionId })) {
      ui.status(line);
    }
  });
}
