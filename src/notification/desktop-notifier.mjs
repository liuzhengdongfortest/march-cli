import { spawn } from "node:child_process";

const DEFAULT_BALLOON_TIMEOUT_MS = 5000;

export function createDesktopTurnNotifier({
  enabled = true,
  platform = process.platform,
  spawnProcess = spawn,
  writeBell = () => process.stdout.write("\x07"),
  config = {},
} = {}) {
  const channels = resolveNotificationChannels(config);
  const minDurationMs = normalizeNonNegativeInteger(config.minDurationMs, 0);
  return {
    async notifyTurnEnd(event) {
      const normalizedEvent = normalizeTurnEvent(event);
      if (!enabled) return { ok: false, reason: "disabled", results: [] };
      if (normalizedEvent.durationMs < minDurationMs) return { ok: false, reason: "min-duration", results: [] };

      const payload = {
        title: normalizedEvent.title ?? defaultTurnTitle(normalizedEvent.status),
        message: normalizedEvent.message ?? defaultTurnMessage(normalizedEvent),
      };
      const results = [];
      if (channels.desktop) {
        results.push({
          channel: "desktop",
          ...(await sendDesktopNotification({ platform, spawnProcess, ...payload })),
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
  // Windows toast APIs can succeed without displaying anything unless the app has a registered AUMID.
  // NotifyIcon balloon tips are less pretty, but reliable for a terminal CLI process.
  return buildWindowsBalloonScript({ title, message, timeoutMs });
}

function resolveNotificationChannels(config) {
  return {
    desktop: config.desktop !== false,
    bell: config.bell === true,
    command: typeof config.command === "string" && config.command.trim() ? config.command.trim() : null,
  };
}

function normalizeTurnEvent(event) {
  return {
    ...event,
    status: event?.status === "error" ? "error" : "success",
    durationMs: normalizeNonNegativeInteger(event?.durationMs, 0),
  };
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

function normalizeNonNegativeInteger(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : fallback;
}

function escapePowerShellSingleQuotedString(text) {
  return String(text).replaceAll("'", "''");
}
