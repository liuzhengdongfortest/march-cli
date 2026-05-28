import { getExternalEditorCommand, openTextInExternalEditor } from "../../input/external-editor.mjs";
import { enterTuiTerminalModes, leaveTuiTerminalModes } from "../terminal-modes.mjs";
import { yellow } from "../ui-theme.mjs";

export function runTuiExternalEditor({ terminal, tui, editor, output, requestRender, mouseOn }) {
  const editorCommand = getExternalEditorCommand();
  if (!editorCommand) {
    output.writeln(yellow(`● No editor configured. Set $VISUAL or $EDITOR.`));
    requestRender();
    return;
  }
  try {
    leaveTuiTerminalModes(terminal, { mouse: mouseOn() });
    tui.stop();
    const result = openTextInExternalEditor({ text: editor.getText(), editorCommand });
    if (result.ok) editor.setText(result.text);
    else output.writeln(yellow(`● ${result.error}`));
  } finally {
    tui.start();
    enterTuiTerminalModes(terminal, { mouse: mouseOn() });
    tui.requestRender(true);
  }
}
