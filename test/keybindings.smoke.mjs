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
  console.log("  PASS");
}
