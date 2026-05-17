export function createRenderScheduler({ requestRender, delayMs = 50 }) {
  let timer = null;

  function renderNow() {
    clearPending();
    requestRender();
  }

  function renderSoon() {
    if (timer) return;
    // Streaming deltas are append-only, so coalesce them without delaying input-driven renders.
    timer = setTimeout(() => {
      timer = null;
      requestRender();
    }, delayMs);
    timer.unref?.();
  }

  function clearPending() {
    if (!timer) return;
    clearTimeout(timer);
    timer = null;
  }

  return { renderNow, renderSoon, clearPending };
}
