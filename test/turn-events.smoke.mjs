import { strict as assert } from "node:assert";

export async function runTurnEventsSmoke() {
  console.log("--- smoke: runner turn event handling ---");
  const { buildAssistantExecutionJson, buildUserRecallInput, createTurnEventState, handleRunnerSessionEvent, recordAssistantRecallInput } = await import("../src/agent/turn/turn-events.mjs");

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
  handleRunnerSessionEvent({ type: "message_update", assistantMessageEvent: { type: "thinking_end", content: "12345678" } }, { ui, engine, state });
  handleRunnerSessionEvent({ type: "tool_execution_start", toolName: "read", args: { path: "a" } }, { ui, engine, state });
  handleRunnerSessionEvent({ type: "tool_execution_end", toolName: "read", isError: false, result: "ok" }, { ui, engine, state });
  handleRunnerSessionEvent({ type: "tool_execution_start", toolName: "command_exec", args: { command: "bad" } }, { ui, engine, state });
  handleRunnerSessionEvent({ type: "tool_execution_end", toolName: "command_exec", isError: true, result: { content: [{ type: "text", text: "Error: failed\nfull details" }], details: { status: 1 } } }, { ui, engine, state });
  handleRunnerSessionEvent({ type: "message_update", assistantMessageEvent: { type: "thinking_start" } }, { ui, engine, state });
  handleRunnerSessionEvent({ type: "message_update", assistantMessageEvent: { type: "thinking_end", content: "end-only" } }, { ui, engine, state });
  handleRunnerSessionEvent({ type: "auto_retry_start", attempt: 1, maxAttempts: 3, delayMs: 2000, errorMessage: "rate" }, { ui, engine, state });
  handleRunnerSessionEvent({ type: "auto_retry_end", success: true, attempt: 1, finalError: null }, { ui, engine, state });

  assert.equal(state.draft, "hello");
  assert.equal(state.thinkingText, "");
  assert.equal(state.thinkingAccumulator, "12345678end-only");

  assert.deepEqual(state.toolCalls, [
    { name: "read", args: { path: "a" }, status: "success" },
    { name: "command_exec", args: { command: "bad" }, status: "failed", error: { message: "Error: failed", details: { status: 1 }, excerpt: "Error: failed\nfull details" } },
  ]);
  assert.deepEqual(state.retries, [{ attempt: 1, maxAttempts: 3, delayMs: 2000, errorMessage: "rate", status: "success", finalError: null }]);
  assert.deepEqual(buildUserRecallInput([{ id: "mem_user", name: "User memory", description: "User recall" }]), {
    type: "recall",
    source: "user",
    delivery: "turn_start",
    customType: "march.recall",
    content: "[recall]\n- mem_user | User memory | User recall",
    hints: [{ id: "mem_user", name: "User memory", description: "User recall" }],
  });
  recordAssistantRecallInput(state, { hints: [{ id: "mem_assistant", name: "Assistant memory", description: "Assistant recall" }], report: { threshold: 0.5 }, delivery: "steer" });
  const executionJson = buildAssistantExecutionJson(state);
  assert.equal(executionJson.schemaVersion, 1);
  assert.equal(executionJson.status, "success");
  assert.equal(executionJson.result.assistantText, "hello");
  assert.equal(executionJson.toolCalls.length, 2);
  assert.equal(executionJson.retries.length, 1);
  assert.equal(executionJson.contextInputs.inTurn[0].source, "assistant");
  assert.equal(executionJson.contextInputs.inTurn[0].content, "[recall]\n- mem_assistant | Assistant memory | Assistant recall");
  assert.deepEqual(calls, [
    ["text", "hello"],
    ["thinkingStart"],
    ["thinking", "12345678"],
    ["thinkingEnd", 2],
    ["toolStart", "read", { path: "a" }],
    ["toolEnd", "read", false, "ok"],
    ["toolStart", "command_exec", { command: "bad" }],
    ["toolEnd", "command_exec", true, { content: [{ type: "text", text: "Error: failed\nfull details" }], details: { status: 1 } }],
    ["thinkingStart"],
    ["thinkingEnd", 2],
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
