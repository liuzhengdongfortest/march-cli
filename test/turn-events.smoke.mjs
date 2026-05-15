import { strict as assert } from "node:assert";

export async function runTurnEventsSmoke() {
  console.log("--- smoke: runner turn event handling ---");
  const { createTurnEventState, handleRunnerSessionEvent } = await import("../src/agent/turn/turn-events.mjs");

  const calls = [];
  const ui = {
    textDelta: (text) => calls.push(["text", text]),
    thinkingStart: () => calls.push(["thinkingStart"]),
    thinkingDelta: (text) => calls.push(["thinking", text]),
    thinkingEnd: (tokens) => calls.push(["thinkingEnd", tokens]),
    toolStart: (name, args) => calls.push(["toolStart", name, args]),
    toolEnd: (name, isError, result) => calls.push(["toolEnd", name, isError, result]),
    retryStart: (event) => calls.push(["retryStart", event.attempt, event.maxAttempts, event.delayMs, event.errorMessage]),
    retryEnd: (event) => calls.push(["retryEnd", event.success, event.attempt, event.finalError]),
  };
  const engine = {};
  const state = createTurnEventState();

  handleRunnerSessionEvent(textDelta("hello"), { ui, engine, state });
  handleRunnerSessionEvent({ type: "message_update", assistantMessageEvent: { type: "thinking_start" } }, { ui, engine, state });
  handleRunnerSessionEvent({ type: "message_update", assistantMessageEvent: { type: "thinking_delta", delta: "12345678" } }, { ui, engine, state });
  handleRunnerSessionEvent({ type: "message_update", assistantMessageEvent: { type: "thinking_end" } }, { ui, engine, state });
  handleRunnerSessionEvent({ type: "tool_execution_start", toolName: "read", args: { path: "a" } }, { ui, engine, state });
  handleRunnerSessionEvent({ type: "tool_execution_end", toolName: "read", isError: false, result: "ok" }, { ui, engine, state });
  handleRunnerSessionEvent({ type: "auto_retry_start", attempt: 1, maxAttempts: 3, delayMs: 2000, errorMessage: "rate" }, { ui, engine, state });
  handleRunnerSessionEvent({ type: "auto_retry_end", success: true, attempt: 1, finalError: null }, { ui, engine, state });

  assert.equal(state.draft, "hello");
  assert.equal(state.thinkingText, "");
  assert.deepEqual(calls, [
    ["text", "hello"],
    ["thinkingStart"],
    ["thinking", "12345678"],
    ["thinkingEnd", 2],
    ["toolStart", "read", { path: "a" }],
    ["toolEnd", "read", false, "ok"],
    ["retryStart", 1, 3, 2000, "rate"],
    ["retryEnd", true, 1, null],
  ]);

  console.log("  PASS");
}

function textDelta(delta) {
  return {
    type: "message_update",
    assistantMessageEvent: { type: "text_delta", delta },
  };
}
