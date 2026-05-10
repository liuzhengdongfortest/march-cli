import { strict as assert } from "node:assert";

export async function runSelectListOverlaySmoke() {
  console.log("--- smoke: select list overlay lifecycle ---");
  const { showSelectListOverlay } = await import("../src/cli/select-list-overlay.mjs");

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
  console.log("  PASS");
}
