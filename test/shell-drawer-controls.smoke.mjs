import { strict as assert } from "node:assert";

export async function runShellDrawerControlsSmoke() {
  console.log("--- smoke: shell drawer controls ---");
  const { createShellDrawerControls } = await import("../src/cli/shell-drawer-controls.mjs");

  const lines = [];
  let renderCount = 0;
  let visible = false;
  let currentTime = 1000;
  const drawer = {
    toggle: () => {
      visible = !visible;
      return visible;
    },
    isVisible: () => visible,
    selectNextShell: () => ({ id: "sh2", name: "test" }),
    scroll: (delta) => ({ offset: delta, maxOffset: 4, atTail: delta === 0 }),
  };
  const controls = createShellDrawerControls({
    shellDrawer: drawer,
    output: { writeln: (line) => lines.push(line) },
    requestRender: () => { renderCount += 1; },
    now: () => currentTime,
  });

  assert.equal(controls.selectNext(), false);
  assert.equal(controls.scroll(1), false);
  assert.equal(renderCount, 0);

  assert.equal(controls.toggle(), true);
  assert.equal(lines.length, 0);
  assert.equal(renderCount, 1);

  currentTime += 10;
  assert.equal(controls.toggle(), true);
  assert.equal(visible, true);
  assert.equal(renderCount, 1);

  assert.deepEqual(controls.selectNext(), { id: "sh2", name: "test" });
  assert.ok(lines.at(-1).includes("shell: test (sh2)"));
  assert.equal(renderCount, 2);

  assert.deepEqual(controls.scroll(-1), { offset: -1, maxOffset: 4, atTail: false });
  assert.equal(renderCount, 3);

  currentTime += 200;
  assert.equal(controls.toggle(), false);
  assert.equal(lines.length, 1);
  assert.equal(renderCount, 4);
  console.log("  PASS");
}
