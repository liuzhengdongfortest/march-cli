import { strict as assert } from "node:assert";
import { visibleWidth } from "@earendil-works/pi-tui";

export async function runStatusBarSmoke() {
  console.log("--- smoke: status bar ---");
  const {
    StatusBar,
    clipToWidth,
    fitStatusText,
    normalizeStatusText,
    padToWidth,
  } = await import("../src/cli/tui/status/status-bar.mjs");
  const { createStatusLineUpdater } = await import("../src/cli/status-line-updater.mjs");
  const { contextTokenRefreshOptions } = await import("../src/cli/repl-loop.mjs");

  assert.equal(normalizeStatusText("  git:main   session:abc  "), "git:main session:abc");
  assert.equal(normalizeStatusText(""), "March");
  assert.equal(visibleWidth(padToWidth("abc", 8)), 8);
  assert.equal(clipToWidth("abcdef", 3), "abc");
  const fitted = fitStatusText("Discuss | gpt-5.4·medium", 20);
  assert.equal(visibleWidth(fitted), 20);
  assert.ok(fitted.includes("gpt-5.4"));
  assert.ok(!fitted.includes("\x1b"));

  const statusBar = new StatusBar("git:main session:abc model:deepseek");
  const [line] = statusBar.render(16);
  assert.equal(visibleWidth(line), 16);
  assert.ok(line.includes("\x1b[48;5;236m"));

  assert.equal(statusBar.setText("Discuss | gpt-5.4·medium"), true);
  assert.equal(statusBar.setText("Discuss | gpt-5.4·medium"), false);
  const [narrow] = statusBar.render(40);
  assert.equal(visibleWidth(narrow), 40);
  assert.ok(narrow.includes("gpt-5.4"));

  statusBar.setText("next");
  assert.equal(visibleWidth(statusBar.render(8)[0]), 8);

  const noop = createStatusLineUpdater({
    ui: {},
    runner: { engine: {} },
    sessionState: { sessionId: "s1" },
  });
  assert.equal(noop(), null);

  const seen = [];
  const update = createStatusLineUpdater({
    ui: { setStatusBar: (text) => seen.push(text) },
    runner: {
      engine: {
        cwd: process.cwd(),
        modelId: "m1",
        provider: "test",
        thinkingLevel: "medium",
      },
      getSessionStats: () => ({
        sessionId: "pi1",
        tokens: { input: 3, output: 5 },
      }),
      getExtensionDiagnostics: () => [],
      getExtensionLifecycleState: () => null,
    },
    sessionState: { sessionId: "legacy1" },
    sessionSource: "pi",
  });
  const statusLine = update({ contextTokens: 11300 });
  const plainStatusLine = stripAnsi(statusLine);
  assert.equal(seen.length, 1);
  assert.equal(seen[0], statusLine);
  assert.ok(plainStatusLine.includes("Do"));
  assert.ok(plainStatusLine.includes("m1·medium"));
  assert.ok(plainStatusLine.includes("11.3K"));
  assert.equal(plainStatusLine.includes("ctx:"), false);
  assert.ok(plainStatusLine.includes(" | "));
  assert.equal(plainStatusLine.includes("git "), false);
  assert.equal(plainStatusLine.includes("pi:"), false);
  assert.ok(stripAnsi(update()).includes("11.3K"));
  const workingLine = update.startWorking();
  assert.ok(stripAnsi(workingLine).includes("Working"));
  assert.ok(stripAnsi(seen.at(-1)).includes("Working"));
  const abortedLine = update.markAborted();
  assert.ok(stripAnsi(abortedLine).includes("x Aborted"));
  assert.equal(stripAnsi(abortedLine).includes("Working"), false);
  assert.ok(stripAnsi(seen.at(-1)).includes("Aborted"));
  const stoppedLine = update.stopWorking();
  assert.ok(stripAnsi(stoppedLine).includes("Aborted"));
  const nextWorkingLine = update.startWorking();
  assert.ok(stripAnsi(nextWorkingLine).includes("Working"));
  assert.equal(stripAnsi(nextWorkingLine).includes("Aborted"), false);
  const finalStoppedLine = update.stopWorking();
  assert.equal(stripAnsi(finalStoppedLine).includes("Working"), false);
  assert.equal(stripAnsi(finalStoppedLine).includes("Aborted"), false);

  assert.deepEqual(
    contextTokenRefreshOptions({ handled: true, refreshContextTokens: true }, { estimateContextTokens: () => 4321 }),
    { contextTokens: 4321 },
  );
  assert.equal(contextTokenRefreshOptions({ handled: true }, { estimateContextTokens: () => 4321 }), undefined);
  console.log("  PASS");
}

function stripAnsi(text) {
  return String(text).replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
}
