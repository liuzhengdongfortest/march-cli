export class MainPaneLayout {
  constructor({ output, statusBar, editor, terminal }) {
    this.output = output;
    this.statusBar = statusBar;
    this.editor = editor;
    this.terminal = terminal;
  }

  render(width) {
    const safeWidth = Math.max(1, Math.trunc(width));
    const statusLines = this.statusBar.render(safeWidth);
    const editorLines = this.editor.render(safeWidth);
    const fixedHeight = statusLines.length + editorLines.length;
    const viewportHeight = Math.max(1, (this.terminal?.rows || 30) - fixedHeight);
    this.output.setViewportHeight(viewportHeight);
    const outputLines = this.output.render(safeWidth);
    return [
      ...padToHeight(outputLines, viewportHeight),
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
