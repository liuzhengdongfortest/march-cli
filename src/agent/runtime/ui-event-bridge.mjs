export function createRuntimeUiEventBus() {
  const listeners = new Set();
  return {
    on(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emit(event) {
      for (const listener of [...listeners]) listener(event);
    },
    async request(event) {
      let response;
      for (const listener of [...listeners]) {
        const result = await listener(event);
        if (response === undefined && result !== undefined) response = result;
      }
      return response;
    },
  };
}

export function createRuntimeUiBridge(ui, { eventBus = createRuntimeUiEventBus() } = {}) {
  const detach = eventBus.on((event) => dispatchRuntimeUiEvent(ui, event));
  return {
    ui: createRuntimeUiClient(eventBus),
    eventBus,
    detach,
  };
}

export function createRuntimeUiClient(eventBus) {
  return {
    turnStart: () => eventBus.emit({ type: "turn_start" }),
    turnEnd: () => eventBus.emit({ type: "turn_end" }),
    assistantReplyEnd: () => eventBus.emit({ type: "assistant_reply_end" }),
    textDelta: (delta) => eventBus.emit({ type: "text_delta", delta }),
    thinkingStart: () => eventBus.emit({ type: "thinking_start" }),
    thinkingDelta: (delta) => eventBus.emit({ type: "thinking_delta", delta }),
    thinkingEnd: (tokens) => eventBus.emit({ type: "thinking_end", tokens }),
    toolStart: (name, args) => eventBus.emit({ type: "tool_start", name, args }),
    toolEnd: (name, isError, result) => eventBus.emit({ type: "tool_end", name, isError, result }),
    retryStart: (event) => eventBus.emit({ type: "retry_start", ...event }),
    retryEnd: (event) => eventBus.emit({ type: "retry_end", ...event }),
    status: (text) => eventBus.emit({ type: "status", text }),
    memoryHint: ({ source, hints }) => eventBus.emit({ type: "memory_hint", source, hints }),
    editDiff: (path, diffLines) => eventBus.emit({ type: "edit_diff", path, diffLines }),
    requestPermission: (request) => eventBus.request({ type: "permission_request", ...request }),
  };
}

export function dispatchRuntimeUiEvent(ui, event) {
  switch (event.type) {
    case "turn_start": return ui.turnStart?.();
    case "turn_end": return ui.turnEnd?.();
    case "assistant_reply_end": return ui.assistantReplyEnd?.();
    case "text_delta": return ui.textDelta?.(event.delta);
    case "thinking_start": return ui.thinkingStart?.();
    case "thinking_delta": return ui.thinkingDelta?.(event.delta);
    case "thinking_end": return ui.thinkingEnd?.(event.tokens);
    case "tool_start": return ui.toolStart?.(event.name, event.args);
    case "tool_end": return ui.toolEnd?.(event.name, event.isError, event.result);
    case "retry_start": return ui.retryStart?.(pickRetryStart(event));
    case "retry_end": return ui.retryEnd?.(pickRetryEnd(event));
    case "status": return ui.status?.(event.text);
    case "memory_hint": return ui.memoryHint?.({ source: event.source, hints: event.hints });
    case "edit_diff": return ui.editDiff?.(event.path, event.diffLines);
    case "permission_request": return ui.requestPermission?.({ toolName: event.toolName, params: event.params, category: event.category });
    default: return undefined;
  }
}

function pickRetryStart({ attempt, maxAttempts, delayMs, errorMessage }) {
  return { attempt, maxAttempts, delayMs, errorMessage };
}

function pickRetryEnd({ success, attempt, finalError }) {
  return { success, attempt, finalError };
}
