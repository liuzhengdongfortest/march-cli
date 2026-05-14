import { strict as assert } from "node:assert";

export async function runShellSplitLayoutSmoke() {
  console.log("--- smoke: shell split layout ---");
  const { ShellSplitLayout, computeShellWidth } = await import("../src/cli/shell/shell-split-layout.mjs");
  const main = { render: (width) => [`main-${width}`, "editor"] };
  const shellPane = {
    visible: false,
    isVisible() { return this.visible; },
    render: (width) => [`shell-${width}`, "ready"],
  };
  const layout = new ShellSplitLayout({ mainChildren: [main], shellPane });

  assert.deepEqual(layout.render(80), ["main-80", "editor"]);
  shellPane.visible = true;
  const rendered = layout.render(80).join("\n");
  assert.equal(computeShellWidth(80), 34);
  assert.ok(rendered.includes("main-45"));
  assert.ok(rendered.includes("│"));
  assert.ok(rendered.includes("shell-34"));
  assert.ok(rendered.includes("editor"));
  assert.ok(rendered.includes("ready"));

  console.log("  PASS");
}
