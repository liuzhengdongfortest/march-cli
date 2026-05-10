export function createShellDrawerControls({ shellDrawer, output, requestRender }) {
  return {
    toggle() {
      const visible = shellDrawer.toggle();
      output.writeln(`\x1b[90m● shell drawer: ${visible ? "open" : "closed"}\x1b[0m`);
      requestRender();
      return visible;
    },

    selectNext() {
      if (!shellDrawer.isVisible()) return false;
      const shell = shellDrawer.selectNextShell();
      if (shell) output.writeln(`\x1b[90m● shell: ${shell.name} (${shell.id})\x1b[0m`);
      requestRender();
      return shell;
    },

    scroll(delta) {
      if (!shellDrawer.isVisible()) return false;
      const state = shellDrawer.scroll(delta);
      requestRender();
      return state;
    },
  };
}
