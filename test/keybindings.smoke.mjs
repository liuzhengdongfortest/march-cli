import { strict as assert } from "node:assert";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export async function runKeybindingsSmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: keybindings config ---");
  const {
    DEFAULT_KEYBINDINGS,
    formatKeybindingLines,
    loadKeybindings,
    normalizeKeybindings,
  } = await import("../src/cli/keybindings.mjs");

  const emptyDir = setupTmp();
  assert.deepEqual(loadKeybindings(emptyDir), {
    keybindings: { ...DEFAULT_KEYBINDINGS },
    diagnostics: [],
  });
  cleanup(emptyDir);

  const normalized = normalizeKeybindings({
    modelSelector: "Ctrl+M",
    unknown: "Ctrl+X",
    externalEditor: "Alt+E",
  });
  assert.equal(normalized.keybindings.modelSelector, "Ctrl+M");
  assert.equal(normalized.keybindings.externalEditor, "Alt+E");
  assert.equal(normalized.diagnostics.length, 1);

  const dir = setupTmp();
  const marchDir = join(dir, ".march");
  mkdirSync(marchDir, { recursive: true });
  writeFileSync(join(marchDir, "keybindings.json"), JSON.stringify({
    toggleToolOutput: "Ctrl+Y",
  }));
  const loaded = loadKeybindings(dir);
  assert.equal(loaded.keybindings.toggleToolOutput, "Ctrl+Y");
  assert.ok(formatKeybindingLines(loaded.keybindings).join("\n").includes("Ctrl+Y"));
  cleanup(dir);

  const {
    createKeybindingDispatcher,
    TERMINAL_KEY_SEQUENCES,
  } = await import("../src/cli/keybinding-dispatch.mjs");

  let toggles = 0;
  const defaultDispatcher = createKeybindingDispatcher({
    handlers: { toggleToolOutput: () => { toggles += 1; } },
  });
  assert.deepEqual(defaultDispatcher.dispatch(TERMINAL_KEY_SEQUENCES["Ctrl+O"]), { consume: true });
  assert.equal(toggles, 1);

  let interrupts = 0;
  const interruptDispatcher = createKeybindingDispatcher({
    handlers: { interrupt: () => { interrupts += 1; } },
  });
  assert.deepEqual(interruptDispatcher.dispatch(TERMINAL_KEY_SEQUENCES["Ctrl+C"]), { consume: true });
  assert.deepEqual(interruptDispatcher.dispatch("\x1b[99;5u"), { consume: true });
  assert.equal(interrupts, 2);

  let escapeAborts = 0;
  const kittyEscapeDispatcher = createKeybindingDispatcher({
    handlers: { abort: () => { escapeAborts += 1; } },
  });
  assert.deepEqual(kittyEscapeDispatcher.dispatch("\x1b[27u"), { consume: true });
  assert.equal(escapeAborts, 1);

  let modelSelections = 0;
  const customDispatcher = createKeybindingDispatcher({
    keybindings: { ...DEFAULT_KEYBINDINGS, modelSelector: "Ctrl+B" },
    handlers: { modelSelector: () => { modelSelections += 1; } },
  });
  assert.equal(customDispatcher.dispatch(TERMINAL_KEY_SEQUENCES["Ctrl+L"]), undefined);
  assert.deepEqual(customDispatcher.dispatch(TERMINAL_KEY_SEQUENCES["Ctrl+B"]), { consume: true });
  assert.equal(modelSelections, 1);

  let pasted = 0;
  const pasteDispatcher = createKeybindingDispatcher({
    handlers: { pasteImage: () => { pasted += 1; } },
  });
  assert.deepEqual(pasteDispatcher.dispatch(TERMINAL_KEY_SEQUENCES["Alt+V"]), { consume: true });
  assert.equal(pasted, 1);

  let shellDrawerToggles = 0;
  const shellDrawerDispatcher = createKeybindingDispatcher({
    handlers: {
      toggleShellDrawer: () => { shellDrawerToggles += 1; },
      nextShell: () => { shellDrawerToggles += 10; },
      shellScrollUp: () => { shellDrawerToggles += 100; },
      shellScrollDown: () => { shellDrawerToggles += 1000; },
    },
  });
  assert.deepEqual(shellDrawerDispatcher.dispatch(TERMINAL_KEY_SEQUENCES["Alt+S"]), { consume: true });
  assert.equal(shellDrawerToggles, 1);
  assert.deepEqual(shellDrawerDispatcher.dispatch(TERMINAL_KEY_SEQUENCES["Alt+N"]), { consume: true });
  assert.equal(shellDrawerToggles, 11);
  assert.deepEqual(shellDrawerDispatcher.dispatch(TERMINAL_KEY_SEQUENCES["Alt+K"]), { consume: true });
  assert.equal(shellDrawerToggles, 111);
  assert.deepEqual(shellDrawerDispatcher.dispatch(TERMINAL_KEY_SEQUENCES["Alt+J"]), { consume: true });
  assert.equal(shellDrawerToggles, 1111);

  let aborts = 0;
  const overlayDispatcher = createKeybindingDispatcher({
    handlers: {
      abort: () => { aborts += 1; },
      interrupt: () => { interrupts += 1; },
    },
    hasOverlay: () => true,
  });
  assert.equal(overlayDispatcher.dispatch(TERMINAL_KEY_SEQUENCES.Esc), undefined);
  assert.equal(aborts, 0);
  assert.deepEqual(overlayDispatcher.dispatch(TERMINAL_KEY_SEQUENCES["Ctrl+C"]), { consume: true });
  assert.equal(interrupts, 3);

  const autocompleteDispatcher = createKeybindingDispatcher({
    handlers: {
      abort: () => { aborts += 1; },
      interrupt: () => { interrupts += 1; },
    },
    isAutocompleteOpen: () => true,
  });
  assert.equal(autocompleteDispatcher.dispatch(TERMINAL_KEY_SEQUENCES.Esc), undefined);
  assert.equal(aborts, 0);
  assert.deepEqual(autocompleteDispatcher.dispatch(TERMINAL_KEY_SEQUENCES["Ctrl+C"]), { consume: true });
  assert.equal(interrupts, 4);
  console.log("  PASS");
}
