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
    text: "",
    setTextInternal(text) { this.text = text; },
    getText() { return this.text; },
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

  calls.length = 0;
  inputListener = null;
  let resolved = false;
  const suppressedPromise = showEditorSelectList({
    tui,
    editor,
    items: [{ value: "a", label: "A" }, { value: "b", label: "B" }],
    requestRender: () => calls.push("render"),
    suppressInitialLineFeed: true,
  }).then((item) => {
    resolved = true;
    return item;
  });

  assert.deepEqual(inputListener("\n"), { consume: true });
  await Promise.resolve();
  assert.equal(resolved, false);
  assert.deepEqual(inputListener("\r"), { consume: true });
  assert.deepEqual(await suppressedPromise, { value: "a", label: "A" });

  calls.length = 0;
  inputListener = null;
  resolved = false;
  const searchablePromise = showEditorSelectList({
    tui,
    editor,
    items: [{ value: "alpha", label: "Alpha" }, { value: "beta", label: "Beta" }],
    requestRender: () => calls.push("render"),
    searchable: true,
    getSearchText: (item) => item.label,
  }).then((item) => {
    resolved = true;
    return item;
  });

  assert.deepEqual(inputListener("z"), { consume: true });
  assert.equal(editor.getText(), "z");
  assert.equal(editor.autocompleteList.filteredItems.length, 0);
  assert.deepEqual(inputListener("\r"), { consume: true });
  await Promise.resolve();
  assert.equal(resolved, false);
  assert.deepEqual(inputListener("\x7f"), { consume: true });
  assert.equal(editor.getText(), "");
  assert.equal(editor.autocompleteList.filteredItems.length, 2);
  assert.deepEqual(inputListener("b"), { consume: true });
  assert.equal(editor.getText(), "b");
  assert.deepEqual(inputListener("\r"), { consume: true });
  assert.deepEqual(await searchablePromise, { value: "beta", label: "Beta" });
  assert.equal(editor.getText(), "");
  console.log("  PASS");
}
