import { matchesKey } from "@earendil-works/pi-tui";

export function createHistoryNavigationController({ editor, requestRender, isAutocompleteOpen = () => false, hasOverlay = () => false } = {}) {
  let draftText = null;

  return {
    handleInput(data) {
      if (isAutocompleteOpen() || hasOverlay()) return undefined;

      if (matchesKey(data, "alt+up")) return moveWithinInput(-1);
      if (matchesKey(data, "alt+down")) return moveWithinInput(1);
      if (matchesKey(data, "up")) return navigateHistory(-1);
      if (matchesKey(data, "down")) return navigateHistory(1);

      return undefined;
    },
  };

  function navigateHistory(direction) {
    const history = Array.isArray(editor?.history) ? editor.history : [];
    const currentIndex = Number.isInteger(editor?.historyIndex) ? editor.historyIndex : -1;
    const nextIndex = currentIndex - direction;
    if (nextIndex < -1 || nextIndex >= history.length) return undefined;

    if (currentIndex === -1) draftText = editor.getText?.() ?? "";
    editor.lastAction = null;
    editor.historyIndex = nextIndex;
    setEditorTextPreservingHistory(nextIndex === -1 ? draftText ?? "" : history[nextIndex] ?? "");
    if (nextIndex === -1) draftText = null;
    requestRender?.();
    return { consume: true };
  }

  function moveWithinInput(direction) {
    editor.lastAction = null;
    if (direction < 0) {
      if (editor.isOnFirstVisualLine?.()) editor.moveToLineStart?.();
      else editor.moveCursor?.(-1, 0);
    } else {
      if (editor.isOnLastVisualLine?.()) editor.moveToLineEnd?.();
      else editor.moveCursor?.(1, 0);
    }
    requestRender?.();
    return { consume: true };
  }

  function setEditorTextPreservingHistory(text) {
    if (typeof editor.setTextInternal === "function") {
      editor.setTextInternal(text);
      return;
    }
    const historyIndex = editor.historyIndex;
    editor.setText?.(text);
    editor.historyIndex = historyIndex;
  }
}
