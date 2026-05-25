export function createRemoteRuntimeUiClient(peer) {
  return {
    turnStart: () => peer.notify("uiEvent", { type: "turn_start" }),
    turnEnd: () => peer.notify("uiEvent", { type: "turn_end" }),
    assistantReplyEnd: () => peer.notify("uiEvent", { type: "assistant_reply_end" }),
    textDelta: (delta) => peer.notify("uiEvent", { type: "text_delta", delta }),
    thinkingStart: () => peer.notify("uiEvent", { type: "thinking_start" }),
    thinkingDelta: (delta) => peer.notify("uiEvent", { type: "thinking_delta", delta }),
    thinkingEnd: (tokens) => peer.notify("uiEvent", { type: "thinking_end", tokens }),
    toolStart: (name, args) => peer.notify("uiEvent", { type: "tool_start", name, args }),
    toolEnd: (name, isError, result) => peer.notify("uiEvent", { type: "tool_end", name, isError, result }),
    retryStart: (event) => peer.notify("uiEvent", { type: "retry_start", ...event }),
    retryEnd: (event) => peer.notify("uiEvent", { type: "retry_end", ...event }),
    status: (text) => peer.notify("uiEvent", { type: "status", text }),
    debugLines: (lines) => peer.notify("uiEvent", { type: "debug_lines", lines }),
    recall: ({ source, hints }) => peer.notify("uiEvent", { type: "recall", source, hints }),
    editDiff: (path, diffLines) => peer.notify("uiEvent", { type: "edit_diff", path, diffLines }),
  };
}
