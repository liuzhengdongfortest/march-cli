import { strict as assert } from "node:assert";
import { Editor, TUI } from "@mariozechner/pi-tui";
import { FakeTerminal } from "./helpers/fake-terminal.mjs";

export async function runTuiAutocompleteEscSmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: TUI autocomplete Esc cancel ---");
  const dir = setupTmp();
  const { buildMarchCommands, MarchAutocompleteProvider } = await import("../src/cli/input/autocomplete.mjs");
  const { createKeybindingDispatcher, TERMINAL_KEY_SEQUENCES } = await import("../src/cli/input/keybinding-dispatch.mjs");
  const { EDITOR_THEME } = await import("../src/cli/tui/ui-theme.mjs");

  const terminal = new FakeTerminal();
  const tui = new TUI(terminal);
  const editor = new Editor(tui, EDITOR_THEME, { paddingX: 1 });
  editor.setAutocompleteProvider(new MarchAutocompleteProvider(buildMarchCommands(), dir));
  tui.addChild(editor);
  tui.setFocus(editor);

  let aborts = 0;
  const dispatcher = createKeybindingDispatcher({
    handlers: { abort: () => { aborts += 1; } },
    isAutocompleteOpen: () => editor.isShowingAutocomplete(),
  });
  tui.addInputListener((data) => dispatcher.dispatch(data));

  tui.start();
  terminal.input("/");
  terminal.input("\t");
  await waitForAutocomplete(editor);
  assert.equal(editor.isShowingAutocomplete(), true);

  terminal.input(TERMINAL_KEY_SEQUENCES.Esc);
  assert.equal(aborts, 0);
  assert.equal(editor.isShowingAutocomplete(), false);
  assert.equal(editor.getText(), "/");

  tui.stop();
  cleanup(dir);
  console.log("  PASS");
}

async function waitForAutocomplete(editor) {
  for (let i = 0; i < 20; i += 1) {
    if (editor.isShowingAutocomplete()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
