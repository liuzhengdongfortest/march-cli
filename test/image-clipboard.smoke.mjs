import { strict as assert } from "node:assert";

export async function runImageClipboardSmoke() {
  console.log("--- smoke: image clipboard ---");
  const {
    getWindowsClipboardImageScript,
    readClipboardImage,
  } = await import("../src/cli/image-clipboard.mjs");

  assert.ok(getWindowsClipboardImageScript().includes("Clipboard]::ContainsImage"));
  assert.deepEqual(readClipboardImage({ platform: "linux" }), {
    ok: false,
    message: "clipboard image paste is not supported on linux",
  });

  const spawnCalls = [];
  const ok = readClipboardImage({
    platform: "win32",
    spawnSyncImpl: (bin, args, options) => {
      spawnCalls.push({ bin, args, options });
      return { status: 0, stdout: "AQID\n", stderr: "" };
    },
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.mimeType, "image/png");
  assert.equal(ok.data, "AQID");
  assert.equal(spawnCalls[0].bin, "powershell.exe");
  assert.ok(spawnCalls[0].args.includes("-NonInteractive"));
  assert.equal(spawnCalls[0].options.windowsHide, true);

  assert.deepEqual(readClipboardImage({
    platform: "win32",
    spawnSyncImpl: () => ({ status: 2, stdout: "", stderr: "clipboard does not contain an image\n" }),
  }), {
    ok: false,
    message: "clipboard does not contain an image",
  });
  assert.deepEqual(readClipboardImage({
    platform: "win32",
    spawnSyncImpl: () => ({ status: 1, stdout: "", stderr: "" }),
  }), {
    ok: false,
    message: "powershell.exe exited 1",
  });
  assert.deepEqual(readClipboardImage({
    platform: "win32",
    spawnSyncImpl: () => ({ status: 0, stdout: "not base64?!" }),
  }), {
    ok: false,
    message: "clipboard image output was not valid base64",
  });
  assert.deepEqual(readClipboardImage({
    platform: "win32",
    spawnSyncImpl: () => ({ error: new Error("missing powershell") }),
  }), {
    ok: false,
    message: "missing powershell",
  });
  console.log("  PASS");
}
