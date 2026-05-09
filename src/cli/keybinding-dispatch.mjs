import { DEFAULT_KEYBINDINGS, KEYBINDING_ACTIONS } from "./keybindings.mjs";

export const TERMINAL_KEY_SEQUENCES = Object.freeze({
  Esc: "\x1b",
  "Shift+Tab": "\x1b[Z",
  ...Object.fromEntries(
    Array.from({ length: 26 }, (_, index) => {
      const letter = String.fromCharCode("A".charCodeAt(0) + index);
      return [`Ctrl+${letter}`, String.fromCharCode(index + 1)];
    })
  ),
});

export function createKeybindingDispatcher({
  keybindings = DEFAULT_KEYBINDINGS,
  handlers = {},
  isAutocompleteOpen = () => false,
  hasOverlay = () => false,
} = {}) {
  const bindingsBySequence = buildBindingsBySequence(keybindings);

  return {
    dispatch(data) {
      const action = bindingsBySequence.get(data);
      if (!action) return undefined;

      if (action === "abort" && isAutocompleteOpen()) return undefined;
      if (hasOverlay()) return undefined;

      const handler = handlers[action];
      if (typeof handler !== "function") return undefined;
      handler();
      return { consume: true };
    },
  };
}

function buildBindingsBySequence(keybindings) {
  const bindings = new Map();
  for (const action of Object.keys(KEYBINDING_ACTIONS)) {
    const key = keybindings[action] ?? DEFAULT_KEYBINDINGS[action];
    const sequence = TERMINAL_KEY_SEQUENCES[key];
    if (!sequence || bindings.has(sequence)) continue;
    bindings.set(sequence, action);
  }
  return bindings;
}
