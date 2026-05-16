import { parseMouseEvent } from "./mouse-tracking.mjs";
import { brightBlack } from "../ui-theme.mjs";

export function createMouseSelectionController({
  terminal,
  output,
  shellDrawer,
  shellDrawerControls,
  selection,
  writeClipboard,
  requestRender,
}) {
  function copySelectionText(text) {
    if (!text) return false;
    const result = writeClipboard(text);
    output.setOverlayStatus([
      result?.ok === false
        ? brightBlack(`● selection copy failed: ${result.message}`)
        : brightBlack(`● copied selection (${text.length} chars)`),
    ]);
    requestRender();
    return result?.ok !== false;
  }

  return {
    handleMouseInput(data, mouseOn) {
      if (!mouseOn) return undefined;
      const mouse = parseMouseEvent(data);
      if (mouse?.type === "scroll") {
        if (shellDrawer.isVisible?.() && mouse.col > Math.floor((terminal.columns || 80) * 0.64)) {
          shellDrawerControls.scroll(mouse.delta);
        } else {
          output.scroll(mouse.delta);
        }
        requestRender();
        return { consume: true };
      }
      if (mouse?.type === "down" && mouse.button === 0) {
        selection.start(mouse);
        requestRender();
        return { consume: true };
      }
      if (mouse?.type === "drag" && mouse.button === 0) {
        selection.update(mouse);
        requestRender();
        return { consume: true };
      }
      if (mouse?.type === "up") {
        const text = selection.finish(mouse);
        if (text) copySelectionText(text);
        else requestRender();
        return { consume: true };
      }
      return undefined;
    },

    handleCopyKey(data) {
      if (data !== "\x03") return undefined;
      const text = selection.text();
      if (!text) return undefined;
      selection.clear();
      copySelectionText(text);
      return { consume: true };
    },
  };
}
