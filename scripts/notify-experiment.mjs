#!/usr/bin/env node
import { spawn } from "node:child_process";
import { buildWindowsNotificationScript, createDesktopTurnNotifier } from "../src/notification/desktop-notifier.mjs";

const title = process.argv[2] ?? "March notification test";
const message = process.argv[3] ?? `If you see this, desktop notifications work. ${new Date().toLocaleTimeString()}`;

console.log(`[notify-experiment] platform=${process.platform}`);
console.log(`[notify-experiment] title=${title}`);
console.log(`[notify-experiment] message=${message}`);

console.log("[notify-experiment] 1/3 bell: writing terminal bell");
process.stdout.write("\x07");
console.log("\n[notify-experiment] bell written");

console.log("[notify-experiment] 2/3 March notifier: launching configured desktop channel");
const notifier = createDesktopTurnNotifier({
  config: { desktop: true, bell: false, minDurationMs: 0 },
});
const notifierResult = await notifier.notifyTurnEnd({
  status: "success",
  title,
  message,
  sessionName: "notify-experiment",
  durationMs: 1000,
});
console.log(`[notify-experiment] March notifier result=${JSON.stringify(notifierResult)}`);

if (process.platform !== "win32") {
  console.log("[notify-experiment] 3/3 raw PowerShell skipped: desktop balloon implementation is Windows-only");
  process.exitCode = notifierResult.ok ? 0 : 1;
} else {
  console.log("[notify-experiment] 3/3 raw PowerShell: running in foreground and collecting errors");
  const script = buildWindowsNotificationScript({ title, message, timeoutMs: 5000 });
  const result = await runPowerShell(script, 10000);
  console.log(`[notify-experiment] raw PowerShell exitCode=${result.exitCode} signal=${result.signal ?? ""}`);
  if (result.stdout.trim()) console.log(`[notify-experiment] raw PowerShell stdout:\n${result.stdout.trim()}`);
  if (result.stderr.trim()) console.error(`[notify-experiment] raw PowerShell stderr:\n${result.stderr.trim()}`);
  if (result.timedOut) console.error("[notify-experiment] raw PowerShell timed out");
  process.exitCode = notifierResult.ok && result.exitCode === 0 && !result.timedOut ? 0 : 1;
}

function runPowerShell(script, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy", "Bypass",
      "-Command", script,
    ], {
      windowsHide: false,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let settled = false;
    const timeout = setTimeout(() => {
      settled = true;
      child.kill();
      resolve({ exitCode: null, signal: "timeout", stdout, stderr, timedOut: true });
    }, timeoutMs);

    child.stdout?.on("data", (chunk) => { stdout += chunk; });
    child.stderr?.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({ exitCode: null, signal: "error", stdout, stderr: `${stderr}${err.message}`, timedOut: false });
    });
    child.on("close", (exitCode, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({ exitCode, signal, stdout, stderr, timedOut: false });
    });
  });
}
