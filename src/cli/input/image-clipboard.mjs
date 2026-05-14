import { spawnSync } from "node:child_process";

const WINDOWS_CLIPBOARD_IMAGE_SCRIPT = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
if (-not [System.Windows.Forms.Clipboard]::ContainsImage()) {
  [Console]::Error.WriteLine("clipboard does not contain an image")
  exit 2
}
$image = [System.Windows.Forms.Clipboard]::GetImage()
$stream = New-Object System.IO.MemoryStream
$image.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
[Convert]::ToBase64String($stream.ToArray())
`.trim();

export function readClipboardImage({
  platform = process.platform,
  spawnSyncImpl = spawnSync,
} = {}) {
  if (platform !== "win32") {
    return { ok: false, message: `clipboard image paste is not supported on ${platform}` };
  }

  const result = spawnSyncImpl("powershell.exe", [
    "-NoProfile",
    "-Sta",
    "-NonInteractive",
    "-Command",
    WINDOWS_CLIPBOARD_IMAGE_SCRIPT,
  ], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.error) return { ok: false, message: result.error.message };
  if (result.status !== 0) {
    const stderr = String(result.stderr || "").trim();
    return { ok: false, message: stderr || `powershell.exe exited ${result.status}` };
  }

  const data = String(result.stdout || "").trim();
  if (!isBase64(data)) return { ok: false, message: "clipboard image output was not valid base64" };
  return {
    ok: true,
    mimeType: "image/png",
    data,
  };
}

export function getWindowsClipboardImageScript() {
  return WINDOWS_CLIPBOARD_IMAGE_SCRIPT;
}

function isBase64(value) {
  return value.length > 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(value);
}
