import { strict as assert } from "node:assert";
import { FakeTerminal } from "./helpers/fake-terminal.mjs";

export async function runSelectListOverlaySmoke() {
  console.log("--- smoke: select list overlay lifecycle ---");
  const { showSelectListOverlay } = await import("../src/cli/tui/select-list-overlay.mjs");

  const calls = [];
  let latestList = null;
  class FakeSelectList {
    constructor(items, maxVisible, theme, options) {
      this.items = items;
      this.maxVisible = maxVisible;
      this.theme = theme;
      this.options = options;
      latestList = this;
    }
    setSelectedIndex(index) {
      this.selectedIndex = index;
    }
  }
  const tui = {
    showOverlay: (list, options) => {
      calls.push(["overlay", list, options]);
      return { hide: () => calls.push(["hide"]) };
    },
  };
  const requestRender = () => calls.push(["render"]);

  assert.equal(await showSelectListOverlay({ tui, items: [], requestRender, SelectListImpl: FakeSelectList }), null);

  const promise = showSelectListOverlay({
    tui,
    items: [{ value: "a" }, { value: "b" }],
    selectedIndex: 1,
    maxVisible: 4,
    width: 50,
    requestRender,
    SelectListImpl: FakeSelectList,
    theme: { active: true },
  });
  assert.equal(latestList.selectedIndex, 1);
  assert.equal(latestList.maxVisible, 4);
  assert.deepEqual(latestList.options, { minPrimaryColumnWidth: 18, maxPrimaryColumnWidth: 32 });
  assert.deepEqual(calls[0][2], { width: 50, minWidth: 40, maxHeight: 5, anchor: "bottom-center", margin: 1 });
  latestList.onSelect({ value: "b" });
  latestList.onCancel();
  assert.deepEqual(await promise, { value: "b" });
  assert.equal(calls.filter(([type]) => type === "hide").length, 1);

  const cancelPromise = showSelectListOverlay({ tui, items: [{ value: "x" }], requestRender, SelectListImpl: FakeSelectList });
  latestList.onCancel();
  assert.equal(await cancelPromise, null);

  const { TUI } = await import("@mariozechner/pi-tui");
  const { TERMINAL_KEY_SEQUENCES } = await import("../src/cli/input/keybinding-dispatch.mjs");
  const terminal = new FakeTerminal();
  const realTui = new TUI(terminal);
  realTui.start();
  const escapePromise = showSelectListOverlay({
    tui: realTui,
    items: [{ value: "model-a" }, { value: "model-b" }],
    requestRender: () => realTui.requestRender(),
  });
  assert.equal(realTui.hasOverlay(), true);
  terminal.input(TERMINAL_KEY_SEQUENCES.Esc);
  assert.equal(await escapePromise, null);
  assert.equal(realTui.hasOverlay(), false);
  realTui.stop();
  console.log("  PASS");
}
