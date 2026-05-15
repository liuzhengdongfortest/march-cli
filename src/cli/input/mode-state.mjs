export const MODES = Object.freeze({
  DO: "do",
  DISCUSS: "discuss",
});

export function createModeState({ initial = MODES.DO } = {}) {
  let mode = normalizeMode(initial);
  return {
    get: () => mode,
    toggle() {
      mode = mode === MODES.DO ? MODES.DISCUSS : MODES.DO;
      return mode;
    },
    set(nextMode) {
      mode = normalizeMode(nextMode);
      return mode;
    },
  };
}

export function appendModeReminder(prompt, mode = MODES.DO) {
  return `${prompt}\n\n${formatModeReminder(mode)}`;
}

export function formatModeLabel(mode = MODES.DO) {
  return normalizeMode(mode) === MODES.DISCUSS ? "Discuss" : "Do";
}

export function formatModeReminder(mode = MODES.DO) {
  if (normalizeMode(mode) === MODES.DISCUSS) {
    return "<mode>\n" +
      "You are in discuss mode. Do not edit files, write files, apply patches, commit, or run commands that modify system state. " +
      "You may inspect, analyze, ask clarifying questions, and propose a plan.\n" +
      "</mode>";
  }
  return "<mode>\n" +
    "You are in do mode. You may implement changes when the user asks for execution, following normal permissions and project rules.\n" +
    "</mode>";
}

function normalizeMode(mode) {
  return mode === MODES.DISCUSS ? MODES.DISCUSS : MODES.DO;
}
