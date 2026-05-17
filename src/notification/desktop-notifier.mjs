import { spawn } from "node:child_process";
import nodeNotifier from "node-notifier";
import { fileURLToPath } from "node:url";

const DEFAULT_BALLOON_TIMEOUT_MS = 5000;
const DEFAULT_NOTIFICATION_ICON_PATH = fileURLToPath(new URL("../assets/march-icon.png", import.meta.url));

export function createDesktopTurnNotifier({
  enabled = true,
  platform = process.platform,
  spawnProcess = spawn,
  writeBell = () => process.stdout.write("\x07"),
  toastNotifier = nodeNotifier,
  config = {},
} = {}) {
  const channels = resolveNotificationChannels(config);
  const minDurationMs = normalizeNonNegativeInteger(config.minDurationMs, 0);
  const toastSound = normalizeNotificationSound(config.sound, true);
  return {
    async notifyTurnEnd(event) {
      const normalizedEvent = normalizeTurnEvent(event);
      if (!enabled) return { ok: false, reason: "disabled", results: [] };
      if (normalizedEvent.durationMs < minDurationMs) return { ok: false, reason: "min-duration", results: [] };

      const payload = {
        title: normalizedEvent.title ?? defaultTurnTitle(normalizedEvent.status),
        message: normalizedEvent.message ?? defaultTurnMessage(normalizedEvent),
        sound: toastSound,
      };
      const results = [];
      if (channels.desktop) {
        results.push({
          channel: "desktop",
          ...(await sendDesktopNotification({ platform, spawnProcess, toastNotifier, ...payload })),
        });
      }
      if (channels.bell) results.push({ channel: "bell", ...sendBellNotification({ writeBell }) });
      if (channels.command) {
        results.push({
          channel: "command",
          ...sendCommandNotification({ spawnProcess, command: channels.command, event: normalizedEvent, ...payload }),
        });
      }

      const delivered = results.some((result) => result.ok);
      return {
        ok: delivered,
        reason: delivered ? undefined : results[0]?.reason ?? "no-channels",
        results,
      };
    },
  };
}

export async function sendDesktopNotification({ platform = process.platform, spawnProcess = spawn, toastNotifier = nodeNotifier, title, message, iconPath = DEFAULT_NOTIFICATION_ICON_PATH, sound = true }) {
  if (platform !== "win32") return { ok: false, reason: "unsupported-platform" };

  const safeTitle = normalizeNotificationText(title) || "March";
  const safeMessage = normalizeNotificationText(message) || "Turn finished";

  try {
    const toastResult = await sendWindowsToastNotification({ toastNotifier, title: safeTitle, message: safeMessage, iconPath, sound });
    if (toastResult.ok) return { ok: true };

    const script = buildWindowsNotificationScript({ title: safeTitle, message: safeMessage, iconPath });
    const balloonResult = await runWindowsNotificationPowerShell({ spawnProcess, script, timeoutMs: DEFAULT_BALLOON_TIMEOUT_MS + 5000 });
    if (balloonResult.ok) return { ok: true, fallback: "balloon", toastReason: toastResult.reason };
    return { ok: false, reason: `toast: ${toastResult.reason}; balloon: ${balloonResult.reason}` };
  } catch (err) {
    return { ok: false, reason: err?.message ?? String(err) };
  }
}

export function sendBellNotification({ writeBell = () => process.stdout.write("\x07") } = {}) {
  try {
    writeBell("\x07");
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err?.message ?? String(err) };
  }
}

export function sendCommandNotification({ spawnProcess = spawn, command, event = {}, title, message }) {
  if (!command) return { ok: false, reason: "command-not-configured" };
  try {
    const child = spawnProcess(String(command), [], {
      shell: true,
      detached: true,
      stdio: "ignore",
      windowsHide: true,
      env: {
        ...process.env,
        MARCH_NOTIFICATION_STATUS: String(event.status ?? ""),
        MARCH_NOTIFICATION_TITLE: normalizeNotificationText(title),
        MARCH_NOTIFICATION_MESSAGE: normalizeNotificationText(message),
        MARCH_NOTIFICATION_SESSION: normalizeNotificationText(event.sessionName),
        MARCH_NOTIFICATION_DURATION_MS: String(event.durationMs ?? 0),
      },
    });
    child?.unref?.();
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err?.message ?? String(err) };
  }
}

export function buildWindowsBalloonScript({ title, message, timeoutMs = DEFAULT_BALLOON_TIMEOUT_MS, iconPath = DEFAULT_NOTIFICATION_ICON_PATH }) {
  const escapedTitle = escapePowerShellSingleQuotedString(title);
  const escapedMessage = escapePowerShellSingleQuotedString(message);
  const escapedIconPath = escapePowerShellSingleQuotedString(iconPath);
  const timeout = Number.isFinite(timeoutMs) ? Math.max(0, Math.trunc(timeoutMs)) : DEFAULT_BALLOON_TIMEOUT_MS;
  return [
    "Add-Type -AssemblyName System.Windows.Forms",
    "Add-Type -AssemblyName System.Drawing",
    "$n = New-Object System.Windows.Forms.NotifyIcon",
    `$sourceBitmap = [System.Drawing.Bitmap]::FromFile('${escapedIconPath}')`,
    "$trayBitmap = New-Object System.Drawing.Bitmap 32, 32",
    "$graphics = [System.Drawing.Graphics]::FromImage($trayBitmap)",
    "$graphics.Clear([System.Drawing.Color]::Transparent)",
    "$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic",
    "$graphics.DrawImage($sourceBitmap, 0, 0, 32, 32)",
    "$icon = [System.Drawing.Icon]::FromHandle($trayBitmap.GetHicon())",
    "$n.Icon = $icon",
    "$n.Text = 'March'",
    "$n.BalloonTipIcon = [System.Windows.Forms.ToolTipIcon]::None",
    `$n.BalloonTipTitle = '${escapedTitle}'`,
    `$n.BalloonTipText = '${escapedMessage}'`,
    "$n.Visible = $true",
    `$n.ShowBalloonTip(${timeout})`,
    `Start-Sleep -Milliseconds ${timeout + 500}`,
    "$n.Dispose()",
    "$icon.Dispose()",
    "$graphics.Dispose()",
    "$trayBitmap.Dispose()",
    "$sourceBitmap.Dispose()",
  ].join("; ");
}

export function buildWindowsNotificationScript({ title, message, timeoutMs = DEFAULT_BALLOON_TIMEOUT_MS, iconPath = DEFAULT_NOTIFICATION_ICON_PATH }) {
  return buildWindowsBalloonScript({ title, message, timeoutMs, iconPath });
}

export function buildWindowsToastOptions({ title, message, iconPath = DEFAULT_NOTIFICATION_ICON_PATH, sound = true }) {
  return {
    title,
    message,
    icon: iconPath,
    appID: "March",
    sound,
    wait: false,
  };
}

function sendWindowsToastNotification({ toastNotifier = nodeNotifier, title, message, iconPath, sound }) {
  return new Promise((resolve) => {
    const notify = toastNotifier?.notify;
    if (typeof notify !== "function") {
      resolve({ ok: false, reason: "toast-notifier-unavailable" });
      return;
    }

    let settled = false;
    const timeout = setTimeout(() => finish({ ok: false, reason: "toast-timeout" }), DEFAULT_BALLOON_TIMEOUT_MS + 5000);
    notify.call(toastNotifier, buildWindowsToastOptions({ title, message, iconPath, sound }), (err) => {
      if (err) {
        finish({ ok: false, reason: err?.message ?? String(err) });
        return;
      }
      finish({ ok: true });
    });

    function finish(result) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(result);
    }
  });
}

function resolveNotificationChannels(config) {
  return {
    desktop: config.desktop !== false,
    bell: config.bell === true,
    command: typeof config.command === "string" && config.command.trim() ? config.command.trim() : null,
  };
}

function runWindowsNotificationPowerShell({ spawnProcess, script, timeoutMs }) {
  return new Promise((resolve) => {
    const child = spawnProcess("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy", "Bypass",
      "-Command", script,
    ], {
      windowsHide: false,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";
    let settled = false;
    const timeout = setTimeout(() => finish({ ok: false, reason: "timeout" }), timeoutMs);

    child?.stderr?.on?.("data", (chunk) => { stderr += chunk; });
    child?.on?.("error", (err) => finish({ ok: false, reason: err?.message ?? String(err) }));
    child?.on?.("close", (exitCode, signal) => {
      if (exitCode === 0) {
        finish({ ok: true });
        return;
      }
      const detail = stderr.trim() || (signal ? `signal ${signal}` : `exit ${exitCode}`);
      finish({ ok: false, reason: detail });
    });

    function finish(result) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(result);
    }
  });
}

function normalizeTurnEvent(event) {
  return {
    ...event,
    status: event?.status === "error" ? "error" : "success",
    durationMs: normalizeNonNegativeInteger(event?.durationMs, 0),
  };
}

function defaultTurnTitle() {
  return "March";
}

function defaultTurnMessage(event) {
  if (event?.status === "error") return event?.errorMessage ?? "Something went wrong";
  return event?.draft || "Turn finished";
}

function normalizeNotificationText(text) {
  return String(text ?? "")
    .replace(/[\u0000-\u001f\u007f-\u009f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

function normalizeNotificationSound(value, fallback) {
  if (value === false) return false;
  if (typeof value === "string") return normalizeNotificationText(value) || fallback;
  return value === undefined ? fallback : Boolean(value);
}

function normalizeNonNegativeInteger(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : fallback;
}

function escapePowerShellSingleQuotedString(text) {
  return String(text).replaceAll("'", "''");
}
