import { strict as assert } from "node:assert";

export async function runPiSessionForkCommandSmoke() {
  console.log("--- smoke: pi session fork command handling ---");
  const { forkPiSessionResetContext, listPiForkCandidates, parseForkPiCommand } = await import("../src/cli/pi-session-fork-command.mjs");

  assert.deepEqual(parseForkPiCommand("hello"), { type: "none" });
  assert.deepEqual(parseForkPiCommand("/fork-piabc"), { type: "none" });
  assert.deepEqual(parseForkPiCommand("/fork-pi"), { type: "fork-pi-candidates" });
  assert.equal(parseForkPiCommand("/fork-pi u1").type, "error");
  assert.deepEqual(parseForkPiCommand("/fork-pi u1 --reset-context"), { type: "fork-pi-reset", entryId: "u1" });

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
    "Use /fork-pi <entry-id> --reset-context to create a fork without inheriting ContextEngine state.",
  ]);

  assert.deepEqual(listPiForkCandidates({
    runner: {
      canSwitchPiSession: () => true,
      getPiForkCandidates: () => { throw new Error("runtime exploded"); },
    },
  }), ["Error: failed to list pi fork candidates: runtime exploded"]);

  assert.deepEqual(await forkPiSessionResetContext("u1", { runner: { canSwitchPiSession: () => false } }), [
    "Error: /fork-pi requires --pi-runtime-host",
  ]);
  assert.deepEqual(await forkPiSessionResetContext("u1", {
    runner: {
      canSwitchPiSession: () => true,
      forkPiSessionWithResetContext: async () => ({ cancelled: true, sourceSessionId: "old" }),
    },
  }), ["Fork pi session cancelled: old"]);
  assert.deepEqual(await forkPiSessionResetContext("u1", {
    runner: {
      canSwitchPiSession: () => true,
      forkPiSessionWithResetContext: async () => ({
        cancelled: false,
        sessionId: "new",
        sourceSessionId: "old",
        entryId: "u1",
        selectedText: "hello\nworld",
      }),
    },
  }), [
    "Forked pi session: new (from: old, entry: u1)",
    "ContextEngine reset: turns/pins/open files/skills were not inherited.",
    "Selected prompt: hello world",
  ]);
  assert.deepEqual(await forkPiSessionResetContext("u1", {
    runner: {
      canSwitchPiSession: () => true,
      forkPiSessionWithResetContext: async () => { throw new Error("runtime exploded"); },
    },
  }), ["Error: failed to fork pi session: runtime exploded"]);
  console.log("  PASS");
}
