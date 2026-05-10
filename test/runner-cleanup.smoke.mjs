import { strict as assert } from "node:assert";

export async function runRunnerCleanupSmoke() {
  console.log("--- smoke: runner cleanup ---");
  const { runRunnerCleanup } = await import("../src/agent/runner-cleanup.mjs");

  const calls = [];
  await runRunnerCleanup([
    () => calls.push("first"),
    async () => {
      await Promise.resolve();
      calls.push("second");
    },
  ]);
  assert.deepEqual(calls, ["first", "second"]);

  const singleFailureCalls = [];
  await assert.rejects(
    () => runRunnerCleanup([
      () => singleFailureCalls.push("first"),
      () => {
        singleFailureCalls.push("second");
        throw new Error("second failed");
      },
      () => singleFailureCalls.push("third"),
    ]),
    /second failed/,
  );
  assert.deepEqual(singleFailureCalls, ["first", "second", "third"]);

  await assert.rejects(
    () => runRunnerCleanup([
      () => { throw new Error("one"); },
      () => { throw new Error("two"); },
    ]),
    (err) => err instanceof AggregateError && err.errors.length === 2 && err.message === "Runner cleanup failed",
  );
  console.log("  PASS");
}
