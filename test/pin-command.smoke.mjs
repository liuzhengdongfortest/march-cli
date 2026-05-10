import { strict as assert } from "node:assert";

export async function runPinCommandSmoke() {
  console.log("--- smoke: pin command handling ---");
  const { handlePinCommand, parsePinCommand } = await import("../src/cli/pin-command.mjs");

  assert.deepEqual(parsePinCommand("hello"), { type: "none" });
  assert.deepEqual(parsePinCommand("/pins"), { type: "list" });
  assert.deepEqual(parsePinCommand("/pin src/app.mjs"), { type: "pin", path: "src/app.mjs" });
  assert.deepEqual(parsePinCommand("/unpin src/app.mjs"), { type: "unpin", path: "src/app.mjs" });

  const pins = new Set();
  const opened = [];
  const engine = {
    resolvePath: (path) => `C:/repo/${path}`,
    addPin: (path) => pins.add(path),
    removePin: (path) => pins.delete(path),
    getPins: () => [...pins],
    isOpen: () => false,
    openFile: (path) => opened.push(path),
  };

  assert.deepEqual(handlePinCommand(parsePinCommand("/pins"), { engine }), ["(no pinned files)"]);
  assert.deepEqual(handlePinCommand(parsePinCommand("/pin src/app.mjs"), { engine }), ["Pinned: C:/repo/src/app.mjs"]);
  assert.deepEqual(opened, ["C:/repo/src/app.mjs"]);
  assert.deepEqual(handlePinCommand(parsePinCommand("/pins"), { engine }), ["C:/repo/src/app.mjs"]);
  assert.deepEqual(handlePinCommand(parsePinCommand("/unpin src/app.mjs"), { engine }), ["Unpinned: C:/repo/src/app.mjs"]);
  assert.deepEqual(handlePinCommand(parsePinCommand("/pins"), { engine }), ["(no pinned files)"]);

  console.log("  PASS");
}
