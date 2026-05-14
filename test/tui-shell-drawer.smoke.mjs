import { strict as assert } from "node:assert";
import { FakeTerminal } from "./helpers/fake-terminal.mjs";

export async function runTuiShellDrawerSmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: TUI shell drawer dispatch ---");
  const dir = setupTmp();
  const { createTuiUI } = await import("../src/cli/ui.mjs");
  const { TERMINAL_KEY_SEQUENCES } = await import("../src/cli/input/keybinding-dispatch.mjs");
  const { stripAnsi } = await import("../src/shell/runtime.mjs");
  const emptyTerminal = new FakeTerminal();
  const emptyUi = createTuiUI({
    cwd: dir,
    terminal: emptyTerminal,
    shellRuntime: { listShells: () => [] },
  });
  const emptyPending = emptyUi.readline("> ");
  emptyTerminal.input(TERMINAL_KEY_SEQUENCES["Alt+S"]);
  await waitForRender();
  const emptyRendered = stripAnsi(emptyTerminal.writes.join(""));
  assert.ok(emptyRendered.includes("│"));
  assert.ok(emptyRendered.includes("shell pane: no shells"));
  emptyUi.requestExit();
  assert.equal(await emptyPending, null);
  await emptyUi.close();

  const terminal = new FakeTerminal();
  const sent = [];
  const resizes = [];
  const shellRuntime = {
    listShells: () => [{
      id: "sh1",
      name: "dev",
      status: "running",
      command: "powershell.exe",
      args: ["-NoLogo"],
    }],
    snapshotShell: () => ({
      plain: "plain",
      ansi: "\x1b[32mready\x1b[0m\n",
    }),
    resizeShell: (id, size) => {
      resizes.push([id, size]);
      return { ok: true, changed: true };
    },
    sendShell: (id, data) => {
      sent.push([id, data]);
      return { ok: true };
    },
  };
  const ui = createTuiUI({ cwd: dir, terminal, shellRuntime });
  const pending = ui.readline("> ");

  terminal.input(TERMINAL_KEY_SEQUENCES["Alt+S"]);
  await waitForRender();
  const rendered = stripAnsi(terminal.writes.join(""));
  assert.ok(rendered.includes("│"));
  assert.ok(rendered.includes("dev"));
  assert.ok(rendered.includes("focus:shell"));
  assert.ok(rendered.includes("ready"));
  assert.equal(rendered.includes("● shell drawer: open"), false);
  assert.deepEqual(resizes.at(-1), ["sh1", { cols: 34, rows: 10 }]);

  terminal.input("x");
  assert.deepEqual(sent, [["sh1", "x"]]);
  assert.equal(ui.getInputText(), "");

  ui.requestExit();
  assert.equal(await pending, null);
  await ui.close();
  assert.deepEqual(terminal.events, ["drain", "stop"]);
  cleanup(dir);
  console.log("  PASS");
}

function waitForRender() {
  return new Promise((resolve) => setTimeout(resolve, 50));
}
