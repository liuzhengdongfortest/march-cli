import { strict as assert } from "node:assert";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pty from "node-pty";

const esc = "\x1b";
const ctrlC = "\x03";
const ctrlT = "\x14";
const testDir = mkdtempSync(resolve(tmpdir(), "march-tui-key-"));
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const binPath = resolve(repoRoot, "march-cli", "bin", "march.mjs");

const term = pty.spawn(process.execPath, [
  binPath,
  "--provider",
  "deepseek",
  "--model",
  "deepseek-v4-pro",
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
    DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY || "dummy-key-for-tui-key-acceptance",
  },
});

const hardTimer = setTimeout(() => {
  try { term.kill(); } catch {}
  console.error("hard timeout waiting for real TUI key acceptance");
  console.error(stripControl(output).slice(-4000));
  process.exit(1);
}, 30000);

let output = "";
let exited = false;

term.onData((chunk) => {
  output += chunk;
  if (output.length > 20000) output = output.slice(-20000);
});
term.onExit(() => {
  exited = true;
});

try {
  await waitForText("March REPL.", 10000);

  term.write(ctrlT);
  await waitForText("off", 10000);
  term.write(esc);
  await waitForText("thinking: unchanged", 10000);

  term.write(ctrlC);
  await waitForExit(10000);
  assert.equal(exited, true);
  console.log("PASS real TUI key acceptance");
  process.exitCode = 0;
} catch (error) {
  try {
    term.write(ctrlC);
    await waitForExit(2000);
  } catch {
    try { term.kill(); } catch {}
  }
  console.error(error?.stack ?? error?.message ?? String(error));
  console.error("Recent PTY output:");
  console.error(stripControl(output).slice(-4000));
  process.exitCode = 1;
} finally {
  clearTimeout(hardTimer);
  cleanupTempDir(testDir);
  process.exit(process.exitCode ?? 0);
}

async function waitForText(text, timeoutMs) {
  await waitFor(() => stripControl(output).includes(text), timeoutMs, `timeout waiting for text: ${text}`);
}

async function waitForExit(timeoutMs) {
  await waitFor(() => exited, timeoutMs, "timeout waiting for March to exit");
}

async function waitFor(predicate, timeoutMs, message) {
  const started = Date.now();
  for (;;) {
    if (predicate()) return;
    if (Date.now() - started > timeoutMs) throw new Error(message);
    await delay(50);
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanupTempDir(path) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
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
