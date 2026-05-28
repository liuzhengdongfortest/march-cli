const ALTERNATE_SCREEN = Object.freeze({ enable: "\x1b[?1049h", disable: "\x1b[?1049l" });
const MOUSE_DRAG_TRACKING = Object.freeze({ enable: "\x1b[?1002h", disable: "\x1b[?1002l" });
const SGR_MOUSE_MODE = Object.freeze({ enable: "\x1b[?1006h", disable: "\x1b[?1006l" });
const ALTERNATE_SCROLL_MODE = Object.freeze({ enable: "\x1b[?1007h", disable: "\x1b[?1007l" });

// Owns terminal feature toggles for March's alternate-screen TUI. Input handling
// must still decide what a resulting key or mouse sequence means.
export function enterTuiTerminalModes(terminal, { alternateScreen = true, mouse = true, alternateScroll = true } = {}) {
  if (alternateScreen) terminal.write(ALTERNATE_SCREEN.enable);
  if (mouse) terminal.write(MOUSE_DRAG_TRACKING.enable + SGR_MOUSE_MODE.enable);
  if (alternateScroll) terminal.write(ALTERNATE_SCROLL_MODE.enable);
}

export function leaveTuiTerminalModes(terminal, { alternateScreen = true, mouse = true, alternateScroll = true } = {}) {
  if (alternateScroll) terminal.write(ALTERNATE_SCROLL_MODE.disable);
  if (mouse) terminal.write(MOUSE_DRAG_TRACKING.disable + SGR_MOUSE_MODE.disable);
  if (alternateScreen) terminal.write(ALTERNATE_SCREEN.disable);
}
