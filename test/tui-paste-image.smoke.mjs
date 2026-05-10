import { strict as assert } from "node:assert";
import { FakeTerminal } from "./helpers/fake-terminal.mjs";

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
    ui.insertAttachmentAtCursor({ marker, label: "[image: image.png]" });
  });
  const pending = ui.readline("> ");
  terminal.input(TERMINAL_KEY_SEQUENCES["Alt+V"]);

  assert.equal(pasteCalls, 1);
  assert.equal(ui.getInputText(), "[image: image.png]");

  terminal.input("\r");
  assert.equal(await pending, marker);
  await ui.close();
  assert.deepEqual(terminal.events, ["drain", "stop"]);
  cleanup(dir);
  console.log("  PASS");
}

export async function runTuiCtrlCSmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: TUI Ctrl+C exit dispatch ---");
  const dir = setupTmp();
  const { createTuiUI } = await import("../src/cli/ui.mjs");
  const { TERMINAL_KEY_SEQUENCES } = await import("../src/cli/keybinding-dispatch.mjs");
  const terminal = new FakeTerminal();
  const ui = createTuiUI({ cwd: dir, terminal });
  let ctrlCCalls = 0;

  ui.setCtrlCHandler(() => {
    ctrlCCalls += 1;
    ui.requestExit();
  });
  const pending = ui.readline("> ");
  terminal.input(TERMINAL_KEY_SEQUENCES["Ctrl+C"]);

  assert.equal(ctrlCCalls, 1);
  assert.equal(await pending, null);
  await ui.close();
  assert.deepEqual(terminal.events, ["drain", "stop"]);
  cleanup(dir);
  console.log("  PASS");
}
