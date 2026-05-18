import { execFileSync } from "node:child_process";

const POWERSHELL = process.env.SystemRoot ? `${process.env.SystemRoot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe` : "powershell.exe";
const MAX_BUFFER = 80 * 1024 * 1024;

export function listWindowsWindows() {
  return runJson(LIST_WINDOWS_SCRIPT);
}

export function captureScreenWindows({ target = "desktop", windowId = null } = {}) {
  if (target === "window") {
    if (!windowId) return { ok: false, message: "windowId is required when target is window" };
    return runJson(CAPTURE_WINDOW_SCRIPT.replace("__WINDOW_ID__", escapePowershellString(windowId)));
  }
  return runJson(CAPTURE_DESKTOP_SCRIPT);
}

function runJson(script) {
  if (process.platform !== "win32") return { ok: false, message: `screen tools are not supported on ${process.platform}` };
  try {
    const output = execFileSync(POWERSHELL, ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script], {
      encoding: "utf8",
      maxBuffer: MAX_BUFFER,
      windowsHide: true,
    }).trim();
    return JSON.parse(output);
  } catch (err) {
    return { ok: false, message: `failed to run Windows screen capture: ${err.stderr || err.message}` };
  }
}

function escapePowershellString(value) {
  return String(value).replaceAll("'", "''");
}

const WIN32_TYPE = String.raw`
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class MarchWin32 {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
}
`;

const LIST_WINDOWS_SCRIPT = String.raw`
Add-Type -TypeDefinition @'
${WIN32_TYPE}
'@
$items = New-Object System.Collections.Generic.List[object]
[MarchWin32]::EnumWindows({ param($hwnd, $lparam)
  if (-not [MarchWin32]::IsWindowVisible($hwnd)) { return $true }
  $length = [MarchWin32]::GetWindowTextLength($hwnd)
  if ($length -le 0) { return $true }
  $builder = New-Object System.Text.StringBuilder ($length + 1)
  [void][MarchWin32]::GetWindowText($hwnd, $builder, $builder.Capacity)
  $rect = New-Object MarchWin32+RECT
  if (-not [MarchWin32]::GetWindowRect($hwnd, [ref]$rect)) { return $true }
  $width = $rect.Right - $rect.Left
  $height = $rect.Bottom - $rect.Top
  if ($width -le 0 -or $height -le 0) { return $true }
  $pidValue = 0
  [void][MarchWin32]::GetWindowThreadProcessId($hwnd, [ref]$pidValue)
  $processName = $null
  try { $processName = (Get-Process -Id $pidValue -ErrorAction Stop).ProcessName } catch {}
  $items.Add([ordered]@{
    id = ("0x{0:x}" -f $hwnd.ToInt64())
    title = $builder.ToString()
    process = $processName
    pid = $pidValue
    bounds = [ordered]@{ x = $rect.Left; y = $rect.Top; width = $width; height = $height }
    minimized = [MarchWin32]::IsIconic($hwnd)
  }) | Out-Null
  return $true
}, [IntPtr]::Zero) | Out-Null
[ordered]@{ ok = $true; windows = $items } | ConvertTo-Json -Compress -Depth 5
`;

const CAPTURE_DESKTOP_SCRIPT = String.raw`
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen
$bitmap = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen($bounds.Left, $bounds.Top, 0, 0, $bounds.Size)
$stream = New-Object System.IO.MemoryStream
$bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose(); $bitmap.Dispose()
[ordered]@{
  ok = $true; data = [Convert]::ToBase64String($stream.ToArray()); mimeType = "image/png";
  target = "desktop"; bounds = [ordered]@{ x = $bounds.Left; y = $bounds.Top; width = $bounds.Width; height = $bounds.Height }
} | ConvertTo-Json -Compress -Depth 5
`;

const CAPTURE_WINDOW_SCRIPT = String.raw`
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @'
${WIN32_TYPE}
'@
$rawId = '__WINDOW_ID__'
$hex = $rawId -replace '^0x',''
try { $hwnd = [IntPtr]::new([Convert]::ToInt64($hex, 16)) } catch {
  [ordered]@{ ok = $false; message = "invalid windowId: $rawId" } | ConvertTo-Json -Compress; exit 0
}
if ([MarchWin32]::IsIconic($hwnd)) {
  [ordered]@{ ok = $false; message = "window is minimized and cannot be captured" } | ConvertTo-Json -Compress; exit 0
}
$rect = New-Object MarchWin32+RECT
if (-not [MarchWin32]::GetWindowRect($hwnd, [ref]$rect)) {
  [ordered]@{ ok = $false; message = "window not found: $rawId" } | ConvertTo-Json -Compress; exit 0
}
$width = $rect.Right - $rect.Left; $height = $rect.Bottom - $rect.Top
if ($width -le 0 -or $height -le 0) {
  [ordered]@{ ok = $false; message = "window has empty bounds: $rawId" } | ConvertTo-Json -Compress; exit 0
}
$bitmap = New-Object System.Drawing.Bitmap $width, $height
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen($rect.Left, $rect.Top, 0, 0, (New-Object System.Drawing.Size $width, $height))
$stream = New-Object System.IO.MemoryStream
$bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose(); $bitmap.Dispose()
[ordered]@{
  ok = $true; data = [Convert]::ToBase64String($stream.ToArray()); mimeType = "image/png";
  target = "window"; windowId = $rawId; bounds = [ordered]@{ x = $rect.Left; y = $rect.Top; width = $width; height = $height }
} | ConvertTo-Json -Compress -Depth 5
`;
