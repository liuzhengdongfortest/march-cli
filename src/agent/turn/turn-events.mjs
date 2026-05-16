export function createTurnEventState() {
  return {
    draft: "",
    thinkingText: "",
    assistantReplyOpen: false,
  };
}

export function handleRunnerSessionEvent(event, { ui, engine, state }) {
  if (event.type === "message_update" && event.assistantMessageEvent) {
    handleAssistantMessageEvent(event.assistantMessageEvent, { ui, state });
  }
  if (event.type === "tool_execution_start") {
    closeAssistantReply({ ui, state });
    ui.toolStart(event.toolName, event.args);
  }
  if (event.type === "tool_execution_end") {
    ui.toolEnd(event.toolName, event.isError, event.result);
  }
  if (event.type === "auto_retry_start") {
    ui.retryStart?.({
      attempt: event.attempt,
      maxAttempts: event.maxAttempts,
      delayMs: event.delayMs,
      errorMessage: event.errorMessage,
    });
  }
  if (event.type === "auto_retry_end") {
    ui.retryEnd?.({
      success: event.success,
      attempt: event.attempt,
      finalError: event.finalError,
    });
  }
}

export function closeAssistantReply({ ui, state }) {
  if (!state.assistantReplyOpen) return;
  ui.assistantReplyEnd?.();
  state.assistantReplyOpen = false;
}

function handleAssistantMessageEvent(event, { ui, state }) {
  if (event.type === "text_delta") {
    state.draft += event.delta;
    state.assistantReplyOpen = true;
    ui.textDelta(event.delta);
  }
  if (event.type === "thinking_start") {
    state.thinkingText = "";
    ui.thinkingStart();
  }
  if (event.type === "thinking_delta") {
    state.thinkingText += event.delta;
    ui.thinkingDelta(event.delta);
  }
  if (event.type === "thinking_end" && state.thinkingText) {
    const tokens = Math.round(state.thinkingText.length / 4);
    ui.thinkingEnd(tokens);
    state.thinkingText = "";
  }
}
