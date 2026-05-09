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
  assert.equal(normalized.keybindings.externalEditor, DEFAULT_KEYBINDINGS.externalEditor);
  assert.equal(normalized.diagnostics.length, 2);

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

  let modelSelections = 0;
  const customDispatcher = createKeybindingDispatcher({
    keybindings: { ...DEFAULT_KEYBINDINGS, modelSelector: "Ctrl+B" },
    handlers: { modelSelector: () => { modelSelections += 1; } },
  });
  assert.equal(customDispatcher.dispatch(TERMINAL_KEY_SEQUENCES["Ctrl+L"]), undefined);
  assert.deepEqual(customDispatcher.dispatch(TERMINAL_KEY_SEQUENCES["Ctrl+B"]), { consume: true });
  assert.equal(modelSelections, 1);

  let aborts = 0;
  const overlayDispatcher = createKeybindingDispatcher({
    handlers: { abort: () => { aborts += 1; } },
    hasOverlay: () => true,
  });
  assert.equal(overlayDispatcher.dispatch(TERMINAL_KEY_SEQUENCES.Esc), undefined);
  assert.equal(aborts, 0);

  const autocompleteDispatcher = createKeybindingDispatcher({
    handlers: { abort: () => { aborts += 1; } },
    isAutocompleteOpen: () => true,
  });
  assert.equal(autocompleteDispatcher.dispatch(TERMINAL_KEY_SEQUENCES.Esc), undefined);
  assert.equal(aborts, 0);
  console.log("  PASS");
}
