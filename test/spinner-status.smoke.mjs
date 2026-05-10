import { strict as assert } from "node:assert";

export async function runSpinnerStatusSmoke() {
  console.log("--- smoke: spinner status lifecycle ---");
  const { createSpinnerStatusController } = await import("../src/cli/spinner-status.mjs");

  const calls = [];
  const intervals = [];
  const controller = createSpinnerStatusController({
    output: {
      setSpinner: (enabled, text) => calls.push(["spinner", enabled, text]),
      tick: () => calls.push(["tick"]),
    },
    requestRender: () => calls.push(["render"]),
    setIntervalImpl: (fn, ms) => {
      intervals.push({ fn, ms });
      return `timer-${intervals.length}`;
    },
    clearIntervalImpl: (timer) => calls.push(["clear", timer]),
  });

  controller.start("Thinking...");
  controller.start("Still thinking...");
  assert.equal(intervals.length, 1);
  assert.equal(intervals[0].ms, 80);
  assert.equal(controller.isRunning(), true);
  intervals[0].fn();
  controller.stop();
  controller.stop();

  assert.deepEqual(calls[0], ["spinner", true, "Thinking..."]);
  assert.deepEqual(calls[2], ["spinner", true, "Still thinking..."]);
  assert.ok(calls.some((call) => call[0] === "tick"));
  assert.equal(calls.filter((call) => call[0] === "clear").length, 1);
  assert.equal(controller.isRunning(), false);
  console.log("  PASS");
}
