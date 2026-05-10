import { strict as assert } from "node:assert";

export async function runShellScreenBufferSmoke() {
  console.log("--- smoke: shell screen buffer ---");
  const { createTerminalScreenBuffer } = await import("../src/shell/screen-buffer.mjs");

  const buffer = createTerminalScreenBuffer({ cols: 12, rows: 4 });
  buffer.write("first");
  await waitFor(() => buffer.snapshot().plain.includes("first"));

  buffer.write("\x1b[2J\x1b[H\x1b[31mok\x1b[0m");
  await waitFor(() => buffer.snapshot().plain === "ok");
  assert.ok(buffer.snapshot().ansi.includes("\x1b[31m"));

  buffer.write("\x1b[3;5Hhi");
  await waitFor(() => buffer.snapshot().plain.includes("    hi"));
  assert.ok(buffer.snapshot().ansi.includes("    hi"));

  buffer.resize(20, 6);
  const resized = buffer.snapshot();
  assert.equal(resized.cols, 20);
  assert.equal(resized.rows, 6);
  buffer.dispose();

  console.log("  PASS");
}

async function waitFor(predicate, timeoutMs = 500) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.ok(predicate());
}
