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
  assert.equal(selection.copyText(), "lpha\nbe");
  assert.ok(selection.apply(["alpha", "beta"]).join("\n").includes("\x1b[7m"));
  selection.setViewport({ topRow: 2, width: 10, lines: ["alpha", "beta"] });
  selection.start({ row: 3, col: 2 });
  selection.update({ row: 4, col: 3 });
  assert.equal(selection.text(), "lpha\nbe");

  const regionalSelection = new ScreenSelection();
  regionalSelection.setRegions([
    { id: "output", topRow: 0, width: 20, lines: ["alpha"] },
    { id: "editor", topRow: 4, width: 20, lines: ["hello copy"] },
  ]);
  regionalSelection.start({ row: 5, col: 1 });
  regionalSelection.update({ row: 5, col: 11 });
  assert.equal(regionalSelection.text(), "hello copy");
  assert.ok(regionalSelection.applyRegion("editor", ["hello copy"])[0].includes("\x1b[7m"));
  assert.deepEqual(regionalSelection.hitTest({ row: 5, col: 1 }), { regionId: "editor", row: 0, col: 0 });


  const sourceSelection = new ScreenSelection();
  sourceSelection.setRegions([
    { id: "output", topRow: 0, width: 20, lines: ["rendered"], copyText: () => "**rendered**" },
  ]);
  sourceSelection.start({ row: 1, col: 1 });
  sourceSelection.update({ row: 1, col: 9 });
  assert.equal(sourceSelection.copyText(), "**rendered**");

  const { OutputBuffer } = await import("../src/cli/tui/output-buffer.mjs");
  const markdownOutput = new OutputBuffer();
  const markdownSource = "# Title\n\n- **bold** item";
  markdownOutput.writeMarkdown(markdownSource);
  markdownOutput.sealCurrentText();
  const selectable = markdownOutput.renderSelectable(80);
  assert.equal(selectable.copyText({ start: { row: 0, col: 0 }, end: { row: selectable.lines.length - 1, col: 80 } }), markdownSource);
  assert.equal(selectable.copyText({ start: { row: 0, col: 1 }, end: { row: selectable.lines.length - 1, col: 80 } }), "");

  const codeOutput = new OutputBuffer();
  codeOutput.writeMarkdown("Before\n\n```js\nconst x = 1;\n```\n\nAfter");
  codeOutput.sealCurrentText();
  const codeSelectable = codeOutput.renderSelectable(80);
  const codeStart = codeSelectable.lines.findIndex((line) => line.includes("╭"));
  const codeEnd = codeSelectable.lines.findIndex((line, index) => index > codeStart && line.includes("╰"));
  assert.equal(codeSelectable.copyText({ start: { row: codeStart, col: 0 }, end: { row: codeEnd, col: 80 } }), "const x = 1;");
  assert.equal(codeSelectable.copyText({ start: { row: codeStart + 1, col: 0 }, end: { row: codeEnd - 1, col: 80 } }), "");

  const tableOutput = new OutputBuffer();
  const tableMarkdown = "Before\n\n| 功能 | 状态 | 备注 |\n| --- | --- | --- |\n| 复制 Markdown | ✅ 通过 | 包含标题、正文和表格 |\n| 表格对齐 | ✅ 通过 | 第二列右对齐 |\n\nAfter";
  tableOutput.writeMarkdown(tableMarkdown);
  tableOutput.sealCurrentText();
  const tableSelectable = tableOutput.renderSelectable(80);
  const tableStart = tableSelectable.lines.findIndex((line) => line.includes("┌"));
  const tableEnd = tableSelectable.lines.findIndex((line) => line.includes("└"));
  assert.equal(tableSelectable.copyText({ start: { row: tableStart, col: 0 }, end: { row: tableEnd, col: 80 } }), "| 功能 | 状态 | 备注 |\n| --- | --- | --- |\n| 复制 Markdown | ✅ 通过 | 包含标题、正文和表格 |\n| 表格对齐 | ✅ 通过 | 第二列右对齐 |");
  assert.equal(tableSelectable.copyText({ start: { row: tableStart + 1, col: 0 }, end: { row: tableEnd - 1, col: 80 } }), "");

  const wrappedCodeOutput = new OutputBuffer();
  const wrappedCode = "const veryLongName = \"abcdefghijklmnopqrstuvwxyz\";";
  wrappedCodeOutput.writeMarkdown(`\`\`\`js\n${wrappedCode}\n\`\`\``);
  wrappedCodeOutput.sealCurrentText();
  const wrappedCodeSelectable = wrappedCodeOutput.renderSelectable(24);
  assert.equal(wrappedCodeSelectable.copyText({ start: { row: 0, col: 0 }, end: { row: wrappedCodeSelectable.lines.length - 1, col: 24 } }), wrappedCode);
  const scrolledOutput = new OutputBuffer();
  scrolledOutput.writeMarkdown("# Top\n\nline1\nline2\nline3\nline4\nline5");
  scrolledOutput.sealCurrentText();
  scrolledOutput.setViewportHeight(3);
  scrolledOutput.scroll(1, { step: 2 });
  const scrolledSelectable = scrolledOutput.renderSelectable(40);
  assert.equal(scrolledSelectable.copyText({ start: { row: 0, col: 0 }, end: { row: scrolledSelectable.lines.length - 1, col: 40 } }), "");
  const coloredSelection = new ScreenSelection();
  const colored = "\x1b[31malpha\x1b[0m";
  coloredSelection.setLines([colored]);
  coloredSelection.start({ row: 1, col: 2 });
  coloredSelection.update({ row: 1, col: 4 });
  const highlighted = coloredSelection.apply([colored])[0];
  assert.ok(highlighted.includes("\x1b[31m"));
  assert.ok(highlighted.includes("\x1b[7m"));

  const markdownSelection = new ScreenSelection();
  const markdownStyled = "\x1b[38;2;245;167;66mbold\x1b[0m plain";
  markdownSelection.setLines([markdownStyled]);
  markdownSelection.start({ row: 1, col: 1 });
  markdownSelection.update({ row: 1, col: 11 });
  const markdownHighlighted = markdownSelection.apply([markdownStyled])[0];
  assert.ok(markdownHighlighted.includes("\x1b[0m\x1b[7m plain"));

  let copied = "";
  const terminal = new FakeTerminal();
  terminal.columns = 40;
  terminal.rows = 12;
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
  terminal.input("\x1b[<32;40;12M");
  terminal.input("\x1b[<0;40;12m");
  assert.equal(copied, "");
  terminal.input("\x03");
  assert.ok(copied.includes("alpha"));
  assert.ok(copied.includes("beta"));
  ui.insertTextAtCursor("hello copy");
  await delay(50);
  copied = "";
  terminal.input("\x1b[<0;1;9M");
  terminal.input("\x1b[<32;30;9M");
  terminal.input("\x1b[<0;30;9m");
  terminal.input("\x03");
  assert.ok(copied.includes("hello copy"));
  await ui.close();
  assert.ok(terminal.writes.join("").includes("\x1b[?1002l\x1b[?1006l"));

  const statusLines = [];
  const controller = createMouseSelectionController({
    terminal: { columns: 40 },
    output: { setOverlayStatus: (lines) => statusLines.push(lines) },
    shellDrawer: { isVisible: () => false },
    shellDrawerControls: { scroll: () => {} },
    selection: { copyText: () => "abc", text: () => "fallback", clear: () => true },
    writeClipboard: () => ({ ok: false, message: "ExternalException\n  + FullyQualifiedErrorId : System.Runtime.InteropServices.ExternalException" }),
    requestRender: () => {},
  });
  controller.handleCopyKey("\x03");
  const plainStatus = stripAnsi(statusLines.at(-1)[0]);
  assert.ok(!plainStatus.includes("\n"));
  assert.ok(plainStatus.includes("ExternalException + FullyQualifiedErrorId"));

  let toggled = false;
  const clickController = createMouseSelectionController({
    terminal: { columns: 40 },
    output: { toggleToolCardAtVisibleRow: (row, width) => { toggled = row === 0 && width === 40; return toggled; } },
    shellDrawer: { isVisible: () => false },
    shellDrawerControls: { scroll: () => {} },
    selection: {
      start: () => true,
      finish: () => "",
      clear: () => true,
      hitTest: () => ({ regionId: "output", row: 0, col: 0 }),
    },
    writeClipboard: () => ({ ok: true }),
    requestRender: () => {},
  });
  clickController.handleMouseInput("\x1b[<0;1;1M");
  clickController.handleMouseInput("\x1b[<0;1;1m");
  assert.equal(toggled, true);

  let asyncResolved = false;
  let renderCount = 0;
  const asyncController = createMouseSelectionController({
    terminal: { columns: 40 },
    output: { setOverlayStatus: (lines) => statusLines.push(lines) },
    shellDrawer: { isVisible: () => false },
    shellDrawerControls: { scroll: () => {} },
    selection: { copyText: () => "async", text: () => "fallback", clear: () => true },
    writeClipboard: () => new Promise((resolve) => setTimeout(() => {
      asyncResolved = true;
      resolve({ ok: true });
    }, 10)),
    requestRender: () => { renderCount += 1; },
  });
  assert.deepEqual(asyncController.handleCopyKey("\x03"), { consume: true });
  assert.equal(asyncResolved, false);
  await delay(20);
  assert.equal(asyncResolved, true);
  assert.ok(renderCount >= 2);
  console.log("  PASS");
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stripAnsi(text) {
  return String(text).replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
}
