import { strict as assert } from "node:assert";

export async function runPiSessionForkCommandSmoke() {
  console.log("--- smoke: pi session fork command handling ---");
  const { listPiForkCandidates, parseForkPiCommand } = await import("../src/cli/pi-session-fork-command.mjs");

  assert.deepEqual(parseForkPiCommand("hello"), { type: "none" });
  assert.deepEqual(parseForkPiCommand("/fork-piabc"), { type: "none" });
  assert.deepEqual(parseForkPiCommand("/fork-pi"), { type: "fork-pi-candidates" });
  assert.equal(parseForkPiCommand("/fork-pi u1").type, "error");

  assert.deepEqual(listPiForkCandidates({ runner: { canSwitchPiSession: () => false } }), [
    "Error: /fork-pi requires --pi-runtime-host",
  ]);
  assert.deepEqual(listPiForkCandidates({
    runner: {
      canSwitchPiSession: () => true,
      getPiForkCandidates: () => [],
    },
  }), ["(no pi fork candidates)"]);

  const lines = listPiForkCandidates({
    runner: {
      canSwitchPiSession: () => true,
      getPiForkCandidates: () => [
        { entryId: "u1", text: "first\nmessage" },
        { entryId: "u2", text: "  second   message  " },
      ],
    },
  });
  assert.deepEqual(lines, [
    "Pi fork candidates:",
    "1. u1  first message",
    "2. u2  second message",
    "Read-only: historical /fork-pi writes are not enabled yet.",
  ]);

  assert.deepEqual(listPiForkCandidates({
    runner: {
      canSwitchPiSession: () => true,
      getPiForkCandidates: () => { throw new Error("runtime exploded"); },
    },
  }), ["Error: failed to list pi fork candidates: runtime exploded"]);
  console.log("  PASS");
}
