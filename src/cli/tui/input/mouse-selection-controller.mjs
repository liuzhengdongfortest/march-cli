import { parseMouseEvent } from "./mouse-tracking.mjs";
import { brightBlack } from "../ui-theme.mjs";

const OUTPUT_WHEEL_SCROLL_LINES = 3;

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
    let result;
    try {
      result = writeClipboard(text);
    } catch (err) {
      setCopyStatus({ ok: false, message: err.message }, text.length);
      return false;
    }
    if (result?.then) {
      output.setOverlayStatus([brightBlack(`● copying selection (${text.length} chars)`)]);
      requestRender();
      result.then(
        (resolved) => setCopyStatus(resolved, text.length),
        (err) => setCopyStatus({ ok: false, message: err.message }, text.length)
      );
      return true;
    }
    setCopyStatus(result, text.length);
    return result?.ok !== false;
  }

  function setCopyStatus(result, length) {
    output.setOverlayStatus([
      result?.ok === false
        ? brightBlack(`● selection copy failed: ${compactStatusMessage(result.message)}`)
        : brightBlack(`● copied selection (${length} chars)`),
    ]);
    requestRender();
  }

  return {
    handleMouseInput(data, mouseOn) {
      if (!mouseOn) return undefined;
      const mouse = parseMouseEvent(data);
      if (mouse?.type === "scroll") {
        if (shellDrawer.isVisible?.() && mouse.col > Math.floor((terminal.columns || 80) * 0.64)) {
          shellDrawerControls.scroll(mouse.delta);
        } else {
          output.scroll(mouse.delta, { step: OUTPUT_WHEEL_SCROLL_LINES });
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
        selection.finish(mouse, { clear: false });
        requestRender();
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

function compactStatusMessage(message) {
  const text = String(message || "unknown error").replace(/\s+/g, " ").trim();
  return text.length > 80 ? `${text.slice(0, 79)}…` : text;
}
