export function createStreamDeltaBuffer({
  writeText,
  writeThinking,
  renderSoon,
  delayMs = 16,
  setTimeoutImpl = setTimeout,
  clearTimeoutImpl = clearTimeout,
} = {}) {
  const queued = [];
  let timer = null;

  function append(kind, delta) {
    if (!delta) return;
    const last = queued.at(-1);
    if (last?.kind === kind) last.text += delta;
    else queued.push({ kind, text: delta });
    schedule();
  }

  function schedule() {
    if (timer) return;
    timer = setTimeoutImpl(() => flush(), delayMs);
    timer.unref?.();
  }

  function flush({ notify = true } = {}) {
    if (timer) {
      clearTimeoutImpl(timer);
      timer = null;
    }
    if (!queued.length) return false;
    const batch = queued.splice(0);
    for (const item of batch) {
      if (item.kind === "thinking") writeThinking(item.text);
      else writeText(item.text);
    }
    if (notify) renderSoon();
    return true;
  }

  return {
    text: (delta) => append("text", delta),
    thinking: (delta) => append("thinking", delta),
    flush,
  };
}
