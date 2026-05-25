import { formatToolStartLine, formatToolSuccessSummary } from "../tool-summary.mjs";

const TOOL_ERROR_EXCERPT_LIMIT = 4000;

export function createTurnEventState() {
  return {
    draft: "",
    thinkingText: "",
    thinkingAccumulator: "",
    recallCursor: { draftLength: 0, thinkingLength: 0 },
    assistantReplyOpen: false,
    assistantContextParts: [],
    activeToolContextPart: null,
    toolCalls: [],
    lastAssistantStopReason: null,
    lastAssistantErrorMessage: null,
  };
}

export function handleRunnerSessionEvent(event, { ui, engine, state }) {
  if (event.type === "message_update" && event.assistantMessageEvent) {
    handleAssistantMessageEvent(event.assistantMessageEvent, { ui, state });
  }
  if (event.type === "message_end" && event.message?.role === "assistant") {
    state.lastAssistantStopReason = event.message.stopReason ?? null;
    state.lastAssistantErrorMessage = event.message.errorMessage ?? null;
  }
  if (event.type === "tool_execution_start") {
    closeAssistantReply({ ui, state });
    appendToolStartContext(state, event.toolName, event.args);
    recordToolStart(state, event.toolName, event.args);
    ui.toolStart(event.toolName, event.args);
  }
  if (event.type === "tool_execution_end") {
    updateToolEndContext(state, event.toolName, event.isError, event.result);
    recordToolEnd(state, event.toolName, event.isError, event.result);
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
    appendAssistantContextText(state, event.delta, "output");
    state.assistantReplyOpen = true;
    ui.textDelta(event.delta);
  }
  if (event.type === "thinking_start") {
    state.thinkingText = "";
    ui.thinkingStart();
  }
  if (event.type === "thinking_delta") {
    state.thinkingText += event.delta;
    appendAssistantContextText(state, event.delta, "thinking");
    ui.thinkingDelta(event.delta);
  }
  if (event.type === "thinking_end") {
    mergeThinkingEndContent(state, event.content);
    if (!state.thinkingText) return;
    const tokens = Math.round(state.thinkingText.length / 4);
    ui.thinkingEnd(tokens);
    state.thinkingAccumulator += state.thinkingText;
    state.thinkingText = "";
  }
}

export function compactAssistantContext(state) {
  return (state?.assistantContextParts ?? [])
    .map((part) => part?.text ?? "")
    .join("")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function appendAssistantContextText(state, text, type) {
  if (!text) return;
  const parts = state.assistantContextParts;
  const last = parts.at(-1);
  if (last?.type === type) {
    last.text += text;
    return;
  }
  if (last && !last.text.endsWith("\n")) last.text += "\n";
  parts.push({ type, text });
}

function mergeThinkingEndContent(state, content) {
  const full = typeof content === "string" ? content : "";
  if (!full || full === state.thinkingText) return;
  if (full.startsWith(state.thinkingText)) {
    const delta = full.slice(state.thinkingText.length);
    state.thinkingText = full;
    appendAssistantContextText(state, delta, "thinking");
  }
}

function appendToolStartContext(state, name, args) {
  const parts = state.assistantContextParts;
  const last = parts.at(-1);
  if (last && !last.text.endsWith("\n")) last.text += "\n";
  const part = { type: "tool", name, text: `${formatToolStartLine(name, args)}\n` };
  parts.push(part);
  state.activeToolContextPart = part;
}

function updateToolEndContext(state, name, isError, result) {
  const part = state.activeToolContextPart;
  if (!part || part.name !== name) return;
  const summary = isError ? "failed" : formatToolSuccessSummary(name, result, "");
  if (summary && summary !== "done") part.text = `${part.text.trimEnd()} (${summary})\n`;
  state.activeToolContextPart = null;
}

function recordToolStart(state, name, args) {
  state.toolCalls.push({ name, args: cloneJson(args), status: "running" });
}

function recordToolEnd(state, name, isError, result) {
  const call = [...state.toolCalls].reverse().find((item) => item.name === name && item.status === "running");
  if (!call) return;
  call.status = isError ? "failed" : "success";
  if (!isError) return;
  const output = extractToolOutput(result);
  call.error = {
    message: output.split(/\r?\n/).find(Boolean) ?? "Tool call failed",
    details: cloneJson(result?.details ?? null),
    excerpt: truncate(output, TOOL_ERROR_EXCERPT_LIMIT),
  };
}

function extractToolOutput(result) {
  const content = result?.content;
  if (!Array.isArray(content)) return typeof result === "string" ? result : "";
  return content.filter((item) => item?.type === "text").map((item) => item.text ?? "").join("\n");
}

function cloneJson(value) {
  try {
    return JSON.parse(JSON.stringify(value ?? null));
  } catch {
    return null;
  }
}

function truncate(text, limit) {
  const value = String(text ?? "");
  return value.length > limit ? `${value.slice(0, limit)}\n[truncated]` : value;
}
