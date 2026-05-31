import { spawnSync } from "node:child_process";

const WINDOWS_CLIPBOARD_IMAGE_SCRIPT = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

function Write-ClipboardImagePayload($mimeType, $bytes) {
  $base64 = [Convert]::ToBase64String($bytes)
  [Console]::Out.WriteLine("$mimeType $base64")
}

if ([System.Windows.Forms.Clipboard]::ContainsImage()) {
  $image = [System.Windows.Forms.Clipboard]::GetImage()
  $stream = New-Object System.IO.MemoryStream
  try {
    $image.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
    Write-ClipboardImagePayload "image/png" ($stream.ToArray())
    exit 0
  } finally {
    $stream.Dispose()
    $image.Dispose()
  }
}

if ([System.Windows.Forms.Clipboard]::ContainsFileDropList()) {
  $files = [System.Windows.Forms.Clipboard]::GetFileDropList()
  foreach ($file in $files) {
    if (-not [System.IO.File]::Exists($file)) { continue }
    $extension = [System.IO.Path]::GetExtension($file).ToLowerInvariant()
    $mimeType = switch ($extension) {
      ".png" { "image/png" }
      ".jpg" { "image/jpeg" }
      ".jpeg" { "image/jpeg" }
      ".webp" { "image/webp" }
      ".gif" { "image/gif" }
      default { $null }
    }
    if ($null -eq $mimeType) { continue }

    $bytes = [System.IO.File]::ReadAllBytes($file)
    Write-ClipboardImagePayload $mimeType $bytes
    exit 0
  }
}

[Console]::Error.WriteLine("clipboard does not contain an image or supported image file")
exit 2
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

  const payload = parseClipboardImagePayload(String(result.stdout || "").trim());
  if (!payload) return { ok: false, message: "clipboard image output was not valid" };
  return {
    ok: true,
    ...payload,
  };
}

export function getWindowsClipboardImageScript() {
  return WINDOWS_CLIPBOARD_IMAGE_SCRIPT;
}

function parseClipboardImagePayload(output) {
  const [mimeType, data] = output.split(/\s+/, 2);
  if (!isSupportedImageMimeType(mimeType) || !isBase64(data)) return null;
  return { mimeType, data };
}

function isSupportedImageMimeType(value) {
  return ["image/gif", "image/jpeg", "image/png", "image/webp"].includes(value);
}

function isBase64(value) {
  return typeof value === "string" && value.length > 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(value);
}
