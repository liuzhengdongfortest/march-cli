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
  let activity = null;
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
      activity: formatActivity(activity, frameIndex),
      lspStatus: runner.getLspStatus?.() ?? null,
    });
    ui.setStatusBar(line);
    return line;
  };

  update.startWorking = () => {
    activity = "working";
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
    if (activity === "working") activity = null;
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    return update();
  };

  update.markAborted = () => {
    activity = "aborted";
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    return update();
  };

  return update;
}

function formatActivity(activity, frameIndex) {
  if (activity === "working") return { frame: WORKING_FRAMES[frameIndex], label: "Working" };
  if (activity === "aborted") return { frame: "x", label: "Aborted" };
  return null;
}
