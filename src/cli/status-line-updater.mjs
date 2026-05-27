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
  let foregroundActivity = null;
  let modelActivity = null;
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
      activity: formatActivity(currentActivity(), frameIndex),
      lspStatus: runner.getLspStatus?.() ?? null,
    });
    ui.setStatusBar(line);
    return line;
  };

  update.startWorking = () => {
    foregroundActivity = { type: "working" };
    frameIndex = 0;
    ensureTimer(update);
    return update();
  };

  update.stopWorking = () => {
    if (foregroundActivity?.type === "working") foregroundActivity = null;
    stopTimerIfIdle();
    return update();
  };

  update.markAborted = () => {
    foregroundActivity = { type: "aborted" };
    stopTimerIfIdle();
    return update();
  };

  update.updateModelDownload = (status = {}) => {
    if (status.phase === "ready" || status.phase === "failed") {
      modelActivity = null;
      stopTimerIfIdle();
      return update();
    }
    modelActivity = { type: "model-download", status };
    ensureTimer(update);
    return update();
  };

  update.stopModelDownload = () => {
    modelActivity = null;
    stopTimerIfIdle();
    return update();
  };

  return update;

  function currentActivity() {
    return foregroundActivity ?? modelActivity;
  }

  function ensureTimer(refresh) {
    if (timer) return;
    timer = setInterval(() => {
      frameIndex = (frameIndex + 1) % WORKING_FRAMES.length;
      refresh();
    }, WORKING_INTERVAL_MS);
    timer.unref?.();
  }

  function stopTimerIfIdle() {
    if (foregroundActivity?.type === "working" || modelActivity) return;
    if (!timer) return;
    clearInterval(timer);
    timer = null;
  }
}

function formatActivity(activity, frameIndex) {
  if (activity?.type === "working") return { frame: WORKING_FRAMES[frameIndex], label: "Working" };
  if (activity?.type === "aborted") return { frame: "x", label: "Aborted" };
  if (activity?.type === "model-download") return formatModelDownloadActivity(activity.status, frameIndex);
  return null;
}

function formatModelDownloadActivity(status = {}, frameIndex) {
  const percent = Number.isFinite(status.percent) ? ` ${Math.max(0, Math.min(100, status.percent))}%` : "";
  const fileProgress = status.fileIndex && status.totalFiles ? ` ${status.fileIndex}/${status.totalFiles}` : "";
  return { frame: WORKING_FRAMES[frameIndex], label: `Downloading Model${percent || fileProgress}` };
}
