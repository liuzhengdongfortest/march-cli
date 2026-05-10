export function formatRetryWaitMessage({ attempt, maxAttempts, remainingMs }) {
  const seconds = Math.ceil(Math.max(0, remainingMs) / 1000);
  return `Retrying (${attempt}/${maxAttempts}) in ${seconds}s... Esc to cancel`;
}

export function formatRetryStartLine(errorMessage) {
  return `\x1b[33m● retrying after error: ${String(errorMessage || "Unknown error").slice(0, 160)}\x1b[0m`;
}

export function formatRetryEndLine({ success, attempt, finalError }) {
  const attempts = `after ${attempt} attempt${attempt === 1 ? "" : "s"}`;
  if (success) return `\x1b[90m● retry recovered ${attempts}\x1b[0m`;
  return `\x1b[31m● retry stopped ${attempts}${finalError ? `: ${finalError}` : ""}\x1b[0m`;
}

export function createRetryStatusController({
  output,
  requestRender,
  stopSpinner,
  setIntervalImpl = setInterval,
  clearIntervalImpl = clearInterval,
  now = () => Date.now(),
}) {
  let retryTimer = null;

  function stop() {
    if (retryTimer) {
      clearIntervalImpl(retryTimer);
      retryTimer = null;
    }
  }

  function start({ attempt, maxAttempts, delayMs, errorMessage }) {
    stopSpinner();
    stop();
    const startedAt = now();
    const message = () => formatRetryWaitMessage({
      attempt,
      maxAttempts,
      remainingMs: delayMs - (now() - startedAt),
    });
    output.writeln(formatRetryStartLine(errorMessage));
    output.setSpinner(true, message());
    retryTimer = setIntervalImpl(() => {
      output.setSpinner(true, message());
      output.tick();
      requestRender();
    }, 250);
    requestRender();
  }

  function end({ success, attempt, finalError }) {
    stop();
    stopSpinner();
    output.writeln(formatRetryEndLine({ success, attempt, finalError }));
    requestRender();
  }

  return { start, end, stop };
}
