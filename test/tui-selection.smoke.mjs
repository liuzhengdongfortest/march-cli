import { strict as assert } from "node:assert";
import { FakeTerminal } from "./helpers/fake-terminal.mjs";

export async function runTuiSelectionSmoke() {
  console.log("--- smoke: TUI mouse selection copy ---");
  const { createTuiUI } = await import("../src/cli/ui.mjs");
  const { parseMouseEvent } = await import("../src/cli/tui/input/mouse-tracking.mjs");
  const { createMouseSelectionController } = await import("../src/cli/tui/input/mouse-selection-controller.mjs");
  const { ScreenSelection } = await import("../src/cli/tui/selection-screen.mjs");

  assert.deepEqual(parseMouseEvent("\x1b[<64;10;2M"), { type: "scroll", delta: -1, col: 10, row: 2 });
  assert.deepEqual(parseMouseEvent("\x1b[<0;1;2M"), { type: "down", button: 0, col: 1, row: 2 });
  assert.deepEqual(parseMouseEvent("\x1b[<32;3;4M"), { type: "drag", button: 0, col: 3, row: 4 });
  assert.deepEqual(parseMouseEvent("\x1b[<0;5;6m"), { type: "up", button: 0, col: 5, row: 6 });

  const selection = new ScreenSelection();
  selection.setLines(["alpha", "beta", "gamma"]);
  selection.start({ row: 1, col: 2 });
  selection.update({ row: 2, col: 3 });
  assert.equal(selection.text(), "lpha\nbe");
  assert.ok(selection.apply(["alpha", "beta"]).join("\n").includes("\x1b[7m"));

  selection.setViewport({ topRow: 2, width: 10, lines: ["alpha", "beta"] });
  selection.start({ row: 3, col: 2 });
  selection.update({ row: 4, col: 3 });
  assert.equal(selection.text(), "lpha\nbe");

  const coloredSelection = new ScreenSelection();
  const colored = "\x1b[31malpha\x1b[0m";
  coloredSelection.setLines([colored]);
  coloredSelection.start({ row: 1, col: 2 });
  coloredSelection.update({ row: 1, col: 4 });
  const highlighted = coloredSelection.apply([colored])[0];
  assert.ok(highlighted.includes("\x1b[31m"));
  assert.ok(highlighted.includes("\x1b[7m"));

  let copied = "";
  const terminal = new FakeTerminal();
  terminal.columns = 40;
  terminal.rows = 8;
  const ui = createTuiUI({
    terminal,
    writeClipboard: (text) => {
      copied = text;
      return { ok: true };
    },
  });
  ui.writeln("alpha");
  ui.writeln("beta");
  await delay(50);
  assert.ok(terminal.writes.join("").includes("\x1b[?1002h\x1b[?1006h"));

  terminal.input("\x1b[<0;1;1M");
  terminal.input("\x1b[<32;40;8M");
  terminal.input("\x1b[<0;40;8m");
  assert.ok(copied.includes("alpha"));
  assert.ok(copied.includes("beta"));

  await ui.close();
  assert.ok(terminal.writes.join("").includes("\x1b[?1002l\x1b[?1006l"));

  const statusLines = [];
  const controller = createMouseSelectionController({
    terminal: { columns: 40 },
    output: { setOverlayStatus: (lines) => statusLines.push(lines) },
    shellDrawer: { isVisible: () => false },
    shellDrawerControls: { scroll: () => {} },
    selection: { finish: () => "abc" },
    writeClipboard: () => ({ ok: false, message: "ExternalException\n  + FullyQualifiedErrorId : System.Runtime.InteropServices.ExternalException" }),
    requestRender: () => {},
  });
  controller.handleMouseInput("\x1b[<0;1;1m", true);
  const plainStatus = stripAnsi(statusLines.at(-1)[0]);
  assert.ok(!plainStatus.includes("\n"));
  assert.ok(plainStatus.includes("ExternalException + FullyQualifiedErrorId"));
  console.log("  PASS");
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stripAnsi(text) {
  return String(text).replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
}
