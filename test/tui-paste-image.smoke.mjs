import { strict as assert } from "node:assert";

class FakeTerminal {
  columns = 80;
  rows = 24;
  writes = [];
  onInput = null;
  onResize = null;
  stopped = false;

  start(onInput, onResize) {
    this.onInput = onInput;
    this.onResize = onResize;
  }

  stop() {
    this.stopped = true;
  }

  write(data) {
    this.writes.push(data);
  }

  hideCursor() {}

  showCursor() {}

  input(data) {
    this.onInput?.(data);
  }
}

export async function runTuiPasteImageSmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: TUI Alt+V image paste dispatch ---");
  const dir = setupTmp();
  const { createTuiUI } = await import("../src/cli/ui.mjs");
  const { TERMINAL_KEY_SEQUENCES } = await import("../src/cli/keybinding-dispatch.mjs");
  const terminal = new FakeTerminal();
  const ui = createTuiUI({ cwd: dir, terminal });
  const marker = "@.march/attachments/session-1/image.png";
  let pasteCalls = 0;

  ui.setPasteImageHandler(() => {
    pasteCalls += 1;
    ui.insertTextAtCursor(marker);
  });
  const pending = ui.readline("> ");
  terminal.input(TERMINAL_KEY_SEQUENCES["Alt+V"]);

  assert.equal(pasteCalls, 1);
  assert.equal(ui.getInputText(), marker);

  terminal.input("\r");
  assert.equal(await pending, marker);
  ui.close();
  cleanup(dir);
  console.log("  PASS");
}
