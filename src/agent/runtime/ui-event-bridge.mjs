export function createRuntimeUiEventTarget(ui) {
  return {
    uiEvent: (event) => dispatchRuntimeUiEvent(ui, event),
    uiRequest: (event) => dispatchRuntimeUiEvent(ui, event),
  };
}

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
    debugLines: (lines) => eventBus.emit({ type: "debug_lines", lines }),
    recall: ({ source, hints, report }) => eventBus.emit({ type: "recall", source, hints, report }),
    providerQuotaSnapshot: (snapshot) => eventBus.emit({ type: "provider_quota_snapshot", snapshot }),
    editDiff: (path, diffLines) => eventBus.emit({ type: "edit_diff", path, diffLines }),
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
    case "debug_lines": return writeDebugLines(ui, event.lines);
    case "recall": return ui.recall?.({ source: event.source, hints: event.hints, report: event.report });
    case "provider_quota_snapshot": return ui.providerQuotaSnapshot?.(event.snapshot);
    case "edit_diff": return ui.editDiff?.(event.path, event.diffLines);
    default: return undefined;
  }
}

function writeDebugLines(ui, lines) {
  if (!Array.isArray(lines)) return undefined;
  if (ui?.debugLines) return ui.debugLines(lines);
  if (!ui?.writeln) return undefined;
  for (const line of lines) ui.writeln(line);
  return undefined;
}

function pickRetryStart({ attempt, maxAttempts, delayMs, errorMessage }) {
  return { attempt, maxAttempts, delayMs, errorMessage };
}

function pickRetryEnd({ success, attempt, finalError }) {
  return { success, attempt, finalError };
}
