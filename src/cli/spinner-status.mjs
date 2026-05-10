const DEFAULT_SPINNER_INTERVAL = 80;

export function createSpinnerStatusController({
  output,
  requestRender,
  intervalMs = DEFAULT_SPINNER_INTERVAL,
  setIntervalImpl = setInterval,
  clearIntervalImpl = clearInterval,
} = {}) {
  let timer = null;

  function start(text) {
    output.setSpinner(true, text);
    if (!timer) {
      timer = setIntervalImpl(() => {
        output.tick();
        requestRender();
      }, intervalMs);
    }
    requestRender();
  }

  function stop() {
    if (timer) {
      clearIntervalImpl(timer);
      timer = null;
    }
    output.setSpinner(false, "");
    requestRender();
  }

  return {
    start,
    stop,
    isRunning: () => Boolean(timer),
  };
}
