import { brightBlack } from "./ui-theme.mjs";

export function createShellDrawerControls({ shellDrawer, output, requestRender, now = () => Date.now(), toggleDebounceMs = 150 }) {
  let lastToggleAt = 0;

  return {
    toggle() {
      const current = now();
      if (current - lastToggleAt < toggleDebounceMs) {
        return shellDrawer.isVisible();
      }
      lastToggleAt = current;
      const visible = shellDrawer.toggle();
      requestRender();
      return visible;
    },

    selectNext() {
      if (!shellDrawer.isVisible()) return false;
      const shell = shellDrawer.selectNextShell();
      if (shell) output.writeln(brightBlack(`● shell: ${shell.name} (${shell.id})`));
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
