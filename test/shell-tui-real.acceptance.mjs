import { strict as assert } from "node:assert";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pty from "node-pty";

const isWindows = process.platform === "win32";
const marker = "MARCH_TUI_DRAWER_OK";
const newline = isWindows ? "\r\n" : "\n";
const altS = "\x1bs";
const ctrlC = "\x03";
const testDir = mkdtempSync(resolve(tmpdir(), "march-tui-shell-"));
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const binPath = resolve(repoRoot, "march-cli", "bin", "march.mjs");

const term = pty.spawn(process.execPath, [
  binPath,
  "--provider",
  "deepseek",
  "--model",
  "deepseek-v4-pro",
  "--shell-runtime",
  "--legacy-sessions",
], {
  name: "xterm-color",
  cols: 100,
  rows: 30,
  cwd: testDir,
  env: {
    ...process.env,
    NODE_OPTIONS: "",
    VSCODE_INSPECTOR_OPTIONS: "",
    DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY || "dummy-key-for-shell-tui-acceptance",
  },
});
const hardTimer = setTimeout(() => {
  try { term.kill(); } catch {}
  console.error("hard timeout waiting for real TUI shell drawer acceptance");
  printDiagnostics();
  process.exit(1);
}, 30000);

let output = "";
let exited = false;
const trace = [];

term.onData((chunk) => {
  output += chunk;
  if (output.length > 20000) output = output.slice(-20000);
});
term.onExit(() => {
  exited = true;
});

try {
  await waitForText("March REPL.", 10000);
  writeInput("/shell spawn accept", `/shell spawn accept${newline}`);
  await waitForText("Spawned shell:", 10000);
  await waitForText("accept", 10000);

  writeInput("Alt+S", altS);
  await waitForText("focus:shell", 10000);
  await delay(500);

  await writeSlow(markerCommand());
  await waitForText(marker, 10000);

  writeInput("Ctrl+C", ctrlC);
  await waitForExit(10000);
  assert.equal(exited, true);
  console.log("PASS real TUI shell drawer acceptance");
  process.exitCode = 0;
} catch (error) {
  try {
    term.write(ctrlC);
    await waitForExit(2000);
  } catch {
    try { term.kill(); } catch {}
  }
  console.error(error?.stack ?? error?.message ?? String(error));
  printDiagnostics();
  process.exitCode = 1;
} finally {
  clearTimeout(hardTimer);
  cleanupTempDir(testDir);
  process.exit(process.exitCode ?? 0);
}

function markerCommand() {
  if (isWindows) return `Write-Output "${marker}"${newline}`;
  return `printf '%s\\n' '${marker}'${newline}`;
}

async function waitForText(text, timeoutMs) {
  trace.push(`wait:text:${text}`);
  await waitFor(() => stripControl(output).includes(text), timeoutMs, `timeout waiting for text: ${text}`);
}

async function waitForExit(timeoutMs) {
  trace.push("wait:exit");
  await waitFor(() => exited, timeoutMs, "timeout waiting for March to exit");
}

async function waitFor(predicate, timeoutMs, message) {
  const started = Date.now();
  for (;;) {
    if (predicate()) return;
    if (Date.now() - started > timeoutMs) throw new Error(message);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

async function writeSlow(text) {
  trace.push(`input:marker-command:${JSON.stringify(text.trim())}`);
  for (const char of text) {
    term.write(char);
    await delay(5);
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanupTempDir(path) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      rmSync(path, { recursive: true, force: true });
      return;
    } catch {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
    }
  }
}

function stripControl(text) {
  return String(text ?? "")
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\x1b[@-Z\\-_]/g, "");
}

function writeInput(name, sequence) {
  trace.push(`input:${name}`);
  term.write(sequence);
}

function printDiagnostics() {
  console.error("Recent acceptance trace:");
  console.error(trace.slice(-20).join(" -> "));
  console.error("Recent PTY output (stripped):");
  console.error(stripControl(output).slice(-4000));
  console.error("Recent PTY output (raw escaped):");
  console.error(JSON.stringify(output.slice(-2000)));
}
