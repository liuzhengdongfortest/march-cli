import { strict as assert } from "node:assert";
import { EventEmitter } from "node:events";
import { openCommand, openFileWithDefaultApp } from "../src/platform/open-file.mjs";

export async function runPlatformOpenFileSmoke() {
  console.log("--- smoke: platform open file ---");

  assert.deepEqual(openCommand("C:\\tmp\\image file.png", { platform: "win32" }), {
    command: "powershell.exe",
    args: ["-NoProfile", "-Command", "& { param($path) Start-Process -FilePath $path }", "C:\\tmp\\image file.png"],
  });
  assert.deepEqual(openCommand("/tmp/image.png", { platform: "darwin" }), {
    command: "open",
    args: ["/tmp/image.png"],
  });
  assert.deepEqual(openCommand("/tmp/image.png", { platform: "linux" }), {
    command: "xdg-open",
    args: ["/tmp/image.png"],
  });

  const calls = [];
  await openFileWithDefaultApp("/tmp/image.png", {
    spawnFn: (command, args, options) => {
      calls.push({ command, args, options });
      const child = new EventEmitter();
      child.unref = () => calls.push({ unref: true });
      queueMicrotask(() => child.emit("spawn"));
      return child;
    },
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.detached, true);
  assert.equal(calls[0].options.stdio, "ignore");
  assert.deepEqual(calls[1], { unref: true });

  console.log("  PASS");
}
