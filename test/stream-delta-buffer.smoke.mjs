import { strict as assert } from "node:assert";

export async function runStreamDeltaBufferSmoke() {
  console.log("--- smoke: stream delta buffer ---");
  const { createStreamDeltaBuffer } = await import("../src/cli/tui/render/stream-delta-buffer.mjs");

  const writes = [];
  const renders = [];
  const timers = [];
  const buffer = createStreamDeltaBuffer({
    writeText: (text) => writes.push(["text", text]),
    writeThinking: (text) => writes.push(["thinking", text]),
    renderSoon: () => renders.push("render"),
    setTimeoutImpl: (fn) => {
      timers.push(fn);
      return { unref() {} };
    },
    clearTimeoutImpl: () => {},
  });

  buffer.text("he");
  buffer.text("llo");
  buffer.thinking("th");
  buffer.thinking("ink");
  assert.equal(writes.length, 0);
  assert.equal(timers.length, 1);

  timers[0]();
  assert.deepEqual(writes, [["text", "hello"], ["thinking", "think"]]);
  assert.deepEqual(renders, ["render"]);

  buffer.text("!");
  assert.equal(buffer.flush({ notify: false }), true);
  assert.deepEqual(writes.at(-1), ["text", "!"]);
  assert.deepEqual(renders, ["render"]);

  console.log("  PASS");
}
