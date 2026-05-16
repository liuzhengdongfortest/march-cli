import { matchesKey } from "@earendil-works/pi-tui";
import { DEFAULT_KEYBINDINGS, KEYBINDING_ACTIONS } from "./keybindings.mjs";

export const TERMINAL_KEY_SEQUENCES = Object.freeze({
  Esc: "\x1b",
  Tab: "\t",
  "Shift+Tab": "\x1b[Z",
  ...Object.fromEntries(
    Array.from({ length: 26 }, (_, index) => {
      const letter = String.fromCharCode("A".charCodeAt(0) + index);
      return [`Ctrl+${letter}`, String.fromCharCode(index + 1)];
    })
  ),
  ...Object.fromEntries(
    Array.from({ length: 26 }, (_, index) => {
      const letter = String.fromCharCode("A".charCodeAt(0) + index);
      return [`Alt+${letter}`, `\x1b${letter.toLowerCase()}`];
    })
  ),
});

export function createKeybindingDispatcher({
  keybindings = DEFAULT_KEYBINDINGS,
  handlers = {},
  isAutocompleteOpen = () => false,
  hasOverlay = () => false,
} = {}) {
  const bindings = buildBindings(keybindings);

  return {
    dispatch(data) {
      const action = findMatchingAction(data, bindings);
      if (!action) return undefined;

      if (action === "interrupt") return runHandler(handlers[action]);
      if (action === "abort" && isAutocompleteOpen()) return undefined;
      if (action === "toggleMode" && isAutocompleteOpen()) return undefined;
      if (hasOverlay()) return undefined;

      return runHandler(handlers[action]);
    },
  };
}

function runHandler(handler) {
  if (typeof handler !== "function") return undefined;
  handler();
  return { consume: true };
}

function buildBindings(keybindings) {
  const bindings = [];
  const claimed = new Set();
  for (const action of Object.keys(KEYBINDING_ACTIONS)) {
    const key = keybindings[action] ?? DEFAULT_KEYBINDINGS[action];
    const keyId = toPiTuiKeyId(key);
    const sequence = TERMINAL_KEY_SEQUENCES[key];
    if (!keyId || claimed.has(keyId)) continue;
    claimed.add(keyId);
    bindings.push({ action, keyId, sequence });
  }
  return bindings;
}

function findMatchingAction(data, bindings) {
  for (const binding of bindings) {
    if (binding.sequence && data === binding.sequence) return binding.action;
    if (matchesKey(data, binding.keyId)) return binding.action;
  }
  return null;
}

function toPiTuiKeyId(key) {
  if (key === "Esc") return "escape";
  return String(key).toLowerCase();
}
