import { strict as assert } from "node:assert";

export async function runRuntimeUiEventsSmoke() {
  console.log("--- smoke: runtime UI event bridge ---");
  const { createRuntimeUiBridge } = await import("../src/agent/runtime/ui-event-bridge.mjs");

  const calls = [];
  const bridge = createRuntimeUiBridge({
    textDelta: (delta) => calls.push(["text", delta]),
    toolStart: (name, args) => calls.push(["toolStart", name, args]),
    retryStart: (event) => calls.push(["retryStart", event.attempt, event.maxAttempts]),
    recall: ({ source, hints }) => calls.push(["recall", source, hints.map((hint) => hint.id)]),
    requestPermission: async ({ toolName, params, category }) => ({ behavior: "allow", toolName, params, category }),
  });

  const observedEvents = [];
  const detachObserver = bridge.eventBus.on((event) => observedEvents.push(event.type));

  bridge.ui.textDelta("hello");
  bridge.ui.toolStart("read", { path: "a" });
  bridge.ui.retryStart({ attempt: 1, maxAttempts: 3, delayMs: 10, errorMessage: "rate" });
  bridge.ui.recall({ source: "assistant", hints: [{ id: "mem_1" }] });
  const decision = await bridge.ui.requestPermission({ toolName: "edit_file", params: { path: "a" }, category: "write" });

  assert.deepEqual(calls, [
    ["text", "hello"],
    ["toolStart", "read", { path: "a" }],
    ["retryStart", 1, 3],
    ["recall", "assistant", ["mem_1"]],
  ]);
  assert.deepEqual(decision, { behavior: "allow", toolName: "edit_file", params: { path: "a" }, category: "write" });
  assert.deepEqual(observedEvents, ["text_delta", "tool_start", "retry_start", "recall", "permission_request"]);

  detachObserver();
  bridge.detach();
  console.log("  PASS");
}
