const DEFAULT_SPINNER_INTERVAL = 80;

export function createSpinnerStatusController({
  output,
  requestRender,
  intervalMs = DEFAULT_SPINNER_INTERVAL,
  setIntervalImpl = setInterval,
  clearIntervalImpl = clearInterval,
} = {}) {
  let timer = null;
  let spinning = false;

  function start(text) {
    spinning = true;
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
    if (!spinning && !timer) return false;
    if (timer) {
      clearIntervalImpl(timer);
      timer = null;
    }
    spinning = false;
    output.setSpinner(false, "");
    requestRender();
    return true;
  }

  return {
    start,
    stop,
    isRunning: () => spinning,
  };
}
