export function createGatewayMessageQueue({ handleMessage, send, logger = console } = {}) {
  if (typeof handleMessage !== "function") throw new Error("Gateway queue requires a message handler");
  if (typeof send !== "function") throw new Error("Gateway queue requires a send function");

  const pending = [];
  let processing = false;

  return {
    enqueue(message) {
      const ahead = pending.length + (processing ? 1 : 0);
      pending.push(message);
      drainSoon();
      if (ahead <= 0) return { type: "queued", lines: [] };
      return { type: "queued", lines: [`Queued: ${ahead} message${ahead === 1 ? "" : "s"} ahead.`] };
    },
    getStats() {
      return { processing, pending: pending.length };
    },
  };

  function drainSoon() {
    if (processing) return;
    processing = true;
    queueMicrotask(() => {
      void drain();
    });
  }

  async function drain() {
    try {
      while (pending.length > 0) {
        const message = pending.shift();
        try {
          const result = await handleMessage(message);
          await send(message, result);
        } catch (err) {
          logger.warn?.(`[gateway:queue] message failed: ${err.message}`);
          await send(message, { type: "error", lines: [`Error: ${err.message}`] });
        }
      }
    } finally {
      processing = false;
      if (pending.length > 0) drainSoon();
    }
  }
}
