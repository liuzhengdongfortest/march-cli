import { strict as assert } from "node:assert";

export async function runRuntimeUiEventsSmoke() {
  console.log("--- smoke: runtime UI event bridge ---");
  const { createRuntimeUiBridge } = await import("../src/agent/runtime/ui-event-bridge.mjs");

  const calls = [];
  const bridge = createRuntimeUiBridge({
    textDelta: (delta) => calls.push(["text", delta]),
    toolStart: (name, args) => calls.push(["toolStart", name, args]),
    retryStart: (event) => calls.push(["retryStart", event.attempt, event.maxAttempts]),
    recall: ({ hints }) => calls.push(["recall", hints.map((hint) => hint.id)]),
  });

  const observedEvents = [];
  const detachObserver = bridge.eventBus.on((event) => observedEvents.push(event.type));

  bridge.ui.textDelta("hello");
  bridge.ui.toolStart("read", { path: "a" });
  bridge.ui.retryStart({ attempt: 1, maxAttempts: 3, delayMs: 10, errorMessage: "rate" });
  bridge.ui.recall({ hints: [{ id: "mem_1" }] });

  assert.deepEqual(calls, [
    ["text", "hello"],
    ["toolStart", "read", { path: "a" }],
    ["retryStart", 1, 3],
    ["recall", ["mem_1"]],
  ]);
  assert.deepEqual(observedEvents, ["text_delta", "tool_start", "retry_start", "recall"]);

  detachObserver();
  bridge.detach();
  console.log("  PASS");
}
