import { strict as assert } from "node:assert";

export async function runEditorSelectListSmoke() {
  console.log("--- smoke: editor select list lifecycle ---");
  const { showEditorSelectList } = await import("../src/cli/tui/select/editor-select-list.mjs");

  const calls = [];
  let inputListener = null;
  const tui = {
    addInputListener(listener) {
      inputListener = listener;
      return () => calls.push("removeInputListener");
    },
  };
  const editor = {
    autocompleteState: null,
    autocompleteList: undefined,
    cancelAutocomplete: () => calls.push("cancelAutocomplete"),
  };
  const promise = showEditorSelectList({
    tui,
    editor,
    items: [{ value: "a", label: "A" }, { value: "b", label: "B" }],
    requestRender: () => calls.push("render"),
  });

  assert.equal(editor.autocompleteState, "force");
  assert.ok(editor.autocompleteList);
  assert.equal(typeof inputListener, "function");
  assert.deepEqual(inputListener("\x1b[B"), { consume: true });
  assert.deepEqual(inputListener("\r"), { consume: true });
  assert.deepEqual(await promise, { value: "b", label: "B" });
  assert.equal(editor.autocompleteState, null);
  assert.equal(editor.autocompleteList, undefined);
  assert.ok(calls.includes("cancelAutocomplete"));
  assert.ok(calls.includes("removeInputListener"));
  console.log("  PASS");
}
