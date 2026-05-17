import { spawn } from "node:child_process";

const DEFAULT_BALLOON_TIMEOUT_MS = 5000;

export function createDesktopTurnNotifier({
  enabled = true,
  platform = process.platform,
  spawnProcess = spawn,
} = {}) {
  return {
    async notifyTurnEnd(event) {
      if (!enabled) return { ok: false, reason: "disabled" };
      return sendDesktopNotification({
        platform,
        spawnProcess,
        title: event?.title ?? defaultTurnTitle(event?.status),
        message: event?.message ?? defaultTurnMessage(event),
      });
    },
  };
}

export async function sendDesktopNotification({ platform = process.platform, spawnProcess = spawn, title, message }) {
  if (platform !== "win32") return { ok: false, reason: "unsupported-platform" };

  const safeTitle = normalizeNotificationText(title) || "March";
  const safeMessage = normalizeNotificationText(message) || "Turn finished";
  const script = buildWindowsNotificationScript({ title: safeTitle, message: safeMessage });

  try {
    const child = spawnProcess("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy", "Bypass",
      "-WindowStyle", "Hidden",
      "-Command", script,
    ], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child?.unref?.();
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err?.message ?? String(err) };
  }
}

export function buildWindowsBalloonScript({ title, message, timeoutMs = DEFAULT_BALLOON_TIMEOUT_MS }) {
  const escapedTitle = escapePowerShellSingleQuotedString(title);
  const escapedMessage = escapePowerShellSingleQuotedString(message);
  const timeout = Number.isFinite(timeoutMs) ? Math.max(0, Math.trunc(timeoutMs)) : DEFAULT_BALLOON_TIMEOUT_MS;
  return [
    "Add-Type -AssemblyName System.Windows.Forms",
    "Add-Type -AssemblyName System.Drawing",
    "$n = New-Object System.Windows.Forms.NotifyIcon",
    "$n.Icon = [System.Drawing.SystemIcons]::Information",
    `$n.BalloonTipTitle = '${escapedTitle}'`,
    `$n.BalloonTipText = '${escapedMessage}'`,
    "$n.Visible = $true",
    `$n.ShowBalloonTip(${timeout})`,
    `Start-Sleep -Milliseconds ${timeout + 500}`,
    "$n.Dispose()",
  ].join("; ");
}

export function buildWindowsNotificationScript({ title, message, timeoutMs = DEFAULT_BALLOON_TIMEOUT_MS }) {
  const toastXml = escapePowerShellDoubleQuotedString(buildToastXml({ title, message }));
  const balloonScript = buildWindowsBalloonScript({ title, message, timeoutMs });
  return [
    "try {",
    "[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null",
    "[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] > $null",
    "$xml = New-Object Windows.Data.Xml.Dom.XmlDocument",
    `$xml.LoadXml("${toastXml}")`,
    "$toast = [Windows.UI.Notifications.ToastNotification]::new($xml)",
    "[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('PowerShell').Show($toast)",
    "} catch {",
    balloonScript,
    "}",
  ].join("; ");
}

function buildToastXml({ title, message }) {
  return `<toast><visual><binding template="ToastGeneric"><text>${escapeXmlText(title)}</text><text>${escapeXmlText(message)}</text></binding></visual></toast>`;
}

function escapeXmlText(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapePowerShellDoubleQuotedString(text) {
  return String(text).replace(/[`"$]/g, "`$&");
}

function defaultTurnTitle(status) {
  return status === "error" ? "March turn failed" : "March is ready";
}

function defaultTurnMessage(event) {
  if (event?.status === "error") return event?.errorMessage ?? "Something went wrong";
  return event?.sessionName ? `${event.sessionName} is ready for review` : "Your turn is ready for review";
}

function normalizeNotificationText(text) {
  return String(text ?? "")
    .replace(/[\u0000-\u001f\u007f-\u009f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

function escapePowerShellSingleQuotedString(text) {
  return String(text).replaceAll("'", "''");
}
