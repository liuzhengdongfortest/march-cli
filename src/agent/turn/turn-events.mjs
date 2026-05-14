export function createTurnEventState() {
  return {
    draft: "",
    summaryDraft: "",
    thinkingText: "",
    summarizing: false,
  };
}

export function handleRunnerSessionEvent(event, { ui, engine, state }) {
  if (event.type === "message_update" && event.assistantMessageEvent) {
    handleAssistantMessageEvent(event.assistantMessageEvent, { ui, state });
  }
  if (event.type === "tool_execution_start" && !state.summarizing) {
    ui.toolStart(event.toolName, event.args);
  }
  if (event.type === "tool_execution_end" && !state.summarizing) {
    ui.toolEnd(event.toolName, event.isError, event.result);
  }
  if (event.type === "compaction_end" && !event.aborted && event.result?.summary) {
    engine.recordCompaction(event.result.summary);
  }
  if (event.type === "auto_retry_start" && !state.summarizing) {
    ui.retryStart?.({
      attempt: event.attempt,
      maxAttempts: event.maxAttempts,
      delayMs: event.delayMs,
      errorMessage: event.errorMessage,
    });
  }
  if (event.type === "auto_retry_end" && !state.summarizing) {
    ui.retryEnd?.({
      success: event.success,
      attempt: event.attempt,
      finalError: event.finalError,
    });
  }
}

function handleAssistantMessageEvent(event, { ui, state }) {
  if (event.type === "text_delta") {
    if (state.summarizing) {
      state.summaryDraft += event.delta;
    } else {
      state.draft += event.delta;
      ui.textDelta(event.delta);
    }
  }
  if (event.type === "thinking_start" && !state.summarizing) {
    state.thinkingText = "";
    ui.thinkingStart();
  }
  if (event.type === "thinking_delta" && !state.summarizing) {
    state.thinkingText += event.delta;
    ui.thinkingDelta(event.delta);
  }
  if (event.type === "thinking_end" && !state.summarizing && state.thinkingText) {
    const tokens = Math.round(state.thinkingText.length / 4);
    ui.thinkingEnd(tokens);
    state.thinkingText = "";
  }
}
