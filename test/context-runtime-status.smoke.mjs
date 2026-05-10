import { strict as assert } from "node:assert";

export async function runContextRuntimeStatusSmoke() {
  console.log("--- smoke: context runtime status ---");
  const { buildRuntimeStatus } = await import("../src/context/runtime-status.mjs");

  const low = buildRuntimeStatus({
    turns: [],
    now: new Date("2026-05-10T00:00:00.000Z"),
  });
  assert.ok(low.includes("time: 2026-05-10T00:00:00.000Z"));
  assert.ok(low.includes("turn: 1"));
  assert.ok(low.includes("context_pressure: low"));

  const moderate = buildRuntimeStatus({
    turns: Array.from({ length: 9 }, (_, index) => ({ index })),
    sessionName: "Sprint",
    openFilesCount: 2,
    pins: ["a.md", "b.md"],
    now: new Date("2026-05-10T00:00:00.000Z"),
  });
  assert.ok(moderate.includes("turn: 10"));
  assert.ok(moderate.includes("context_pressure: moderate"));
  assert.ok(moderate.includes("session_name: Sprint"));
  assert.ok(moderate.includes("open_files: 2"));
  assert.ok(moderate.includes("  - a.md"));

  const high = buildRuntimeStatus({
    turns: Array.from({ length: 16 }, (_, index) => ({ index })),
    now: new Date("2026-05-10T00:00:00.000Z"),
  });
  assert.ok(high.includes("context_pressure: high"));
  console.log("  PASS");
}
