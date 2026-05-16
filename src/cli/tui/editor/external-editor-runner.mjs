import { getExternalEditorCommand, openTextInExternalEditor } from "../../input/external-editor.mjs";
import { yellow } from "../ui-theme.mjs";

export function runTuiExternalEditor({ terminal, tui, editor, output, requestRender, mouseOn }) {
  const editorCommand = getExternalEditorCommand();
  if (!editorCommand) {
    output.writeln(yellow(`● No editor configured. Set $VISUAL or $EDITOR.`));
    requestRender();
    return;
  }
  try {
    terminal.write("\x1b[?1049l");
    tui.stop();
    if (mouseOn()) terminal.write("\x1b[?1002l\x1b[?1006l");
    const result = openTextInExternalEditor({ text: editor.getText(), editorCommand });
    if (result.ok) editor.setText(result.text);
    else output.writeln(yellow(`● ${result.error}`));
  } finally {
    tui.start();
    terminal.write("\x1b[?1049h");
    if (mouseOn()) terminal.write("\x1b[?1002h\x1b[?1006h");
    tui.requestRender(true);
  }
}
