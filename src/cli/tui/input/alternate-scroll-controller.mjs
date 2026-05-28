import { matchesKey } from "@earendil-works/pi-tui";

const FALLBACK_SCROLL_STEP = 3;

export function createAlternateScrollController({ editor, output, requestRender, isAutocompleteOpen = () => false, hasOverlay = () => false } = {}) {
  return {
    handleInput(data) {
      const delta = parseAlternateScrollKey(data);
      if (delta === null) return undefined;
      if (!canTreatArrowAsScrollIntent()) return undefined;

      output.scroll(delta, { step: FALLBACK_SCROLL_STEP });
      requestRender?.();
      return { consume: true };
    },
  };

  function canTreatArrowAsScrollIntent() {
    if (isAutocompleteOpen() || hasOverlay()) return false;
    if ((editor?.getText?.() ?? "").length > 0) return false;
    return true;
  }
}

export function parseAlternateScrollKey(data) {
  if (matchesKey(data, "up")) return -1;
  if (matchesKey(data, "down")) return 1;
  return null;
}
