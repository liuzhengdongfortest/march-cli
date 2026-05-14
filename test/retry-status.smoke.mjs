import { strict as assert } from "node:assert";

export async function runRetryStatusSmoke() {
  console.log("--- smoke: retry status formatting ---");
  const {
    createRetryStatusController,
    formatRetryEndLine,
    formatRetryStartLine,
    formatRetryWaitMessage,
  } = await import("../src/cli/tui/status/retry-status.mjs");

  assert.equal(
    formatRetryWaitMessage({ attempt: 2, maxAttempts: 5, remainingMs: 2100 }),
    "Retrying (2/5) in 3s... Esc to cancel",
  );
  assert.equal(
    formatRetryWaitMessage({ attempt: 2, maxAttempts: 5, remainingMs: -20 }),
    "Retrying (2/5) in 0s... Esc to cancel",
  );
  assert.ok(formatRetryStartLine("x".repeat(180)).includes("x".repeat(160)));
  assert.equal(formatRetryEndLine({ success: true, attempt: 1 }), "\x1b[90m● retry recovered after 1 attempt\x1b[0m");
  assert.equal(formatRetryEndLine({ success: false, attempt: 2, finalError: "rate" }), "\x1b[31m● retry stopped after 2 attempts: rate\x1b[0m");

  let now = 1000;
  const calls = [];
  const intervals = [];
  const controller = createRetryStatusController({
    output: {
      writeln: (line) => calls.push(["writeln", line]),
      setSpinner: (enabled, text) => calls.push(["spinner", enabled, text]),
      tick: () => calls.push(["tick"]),
    },
    requestRender: () => calls.push(["render"]),
    stopSpinner: () => calls.push(["stopSpinner"]),
    setIntervalImpl: (fn, ms) => {
      intervals.push({ fn, ms });
      return `timer-${intervals.length}`;
    },
    clearIntervalImpl: (timer) => calls.push(["clear", timer]),
    now: () => now,
  });
  controller.start({ attempt: 1, maxAttempts: 3, delayMs: 2000, errorMessage: "rate" });
  assert.equal(intervals[0].ms, 250);
  assert.deepEqual(calls.slice(0, 3).map((call) => call[0]), ["stopSpinner", "writeln", "spinner"]);
  now = 2500;
  intervals[0].fn();
  assert.ok(calls.some((call) => call[0] === "spinner" && call[2].includes("in 1s")));
  controller.end({ success: false, attempt: 1, finalError: "rate" });
  assert.ok(calls.some((call) => call[0] === "clear" && call[1] === "timer-1"));
  assert.ok(calls.some((call) => call[0] === "writeln" && call[1].includes("retry stopped")));
  console.log("  PASS");
}
