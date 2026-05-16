export class MainPaneLayout {
  constructor({ output, statusBar, editor, terminal, selection = null }) {
    this.output = output;
    this.statusBar = statusBar;
    this.editor = editor;
    this.terminal = terminal;
    this.selection = selection;
  }

  render(width) {
    const safeWidth = Math.max(1, Math.trunc(width));
    const statusLines = this.statusBar.render(safeWidth);
    const editorLines = this.editor.render(safeWidth);
    const fixedHeight = statusLines.length + editorLines.length;
    const viewportHeight = Math.max(1, (this.terminal?.rows || 30) - fixedHeight);
    this.output.setViewportHeight(viewportHeight);
    const outputLines = this.output.render(safeWidth);
    const outputTop = Math.max(0, viewportHeight - outputLines.length);
    this.selection?.setViewport({ topRow: outputTop, leftCol: 0, width: safeWidth, lines: outputLines });
    const selectedOutputLines = this.selection?.apply(outputLines) ?? outputLines;
    return [
      ...padToHeight(selectedOutputLines, viewportHeight),
      ...statusLines,
      ...editorLines,
    ];
  }

  invalidate() {
    this.output.invalidate?.();
    this.statusBar.invalidate?.();
    this.editor.invalidate?.();
  }
}

function padToHeight(lines, height) {
  if (lines.length >= height) return lines;
  return [...Array(height - lines.length).fill(""), ...lines];
}
