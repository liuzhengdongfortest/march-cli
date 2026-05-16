import { statusBarLine } from "./commands/status-command.mjs";

const WORKING_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const WORKING_INTERVAL_MS = 120;

export function createStatusLineUpdater({
  ui,
  runner,
  sessionState,
  sessionSource = "pi",
  getMode = () => undefined,
}) {
  let contextTokens = null;
  let working = false;
  let frameIndex = 0;
  let timer = null;

  const update = (options = {}) => {
    if (typeof ui.setStatusBar !== "function") return null;
    if (Object.hasOwn(options, "contextTokens")) contextTokens = options.contextTokens;
    const line = statusBarLine({
      runner,
      sessionState,
      sessionSource,
      extensionDiagnostics: runner.getExtensionDiagnostics?.() ?? [],
      lifecycleState: runner.getExtensionLifecycleState?.() ?? null,
      mode: getMode(),
      contextTokens,
      activity: working ? { frame: WORKING_FRAMES[frameIndex], label: "Working" } : null,
    });
    ui.setStatusBar(line);
    return line;
  };

  update.startWorking = () => {
    working = true;
    frameIndex = 0;
    const line = update();
    if (!timer) {
      timer = setInterval(() => {
        frameIndex = (frameIndex + 1) % WORKING_FRAMES.length;
        update();
      }, WORKING_INTERVAL_MS);
      timer.unref?.();
    }
    return line;
  };

  update.stopWorking = () => {
    working = false;
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    return update();
  };

  return update;
}
