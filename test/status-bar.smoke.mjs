import { strict as assert } from "node:assert";
import { visibleWidth } from "@mariozechner/pi-tui";

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

  statusBar.setText("Discuss | gpt-5.4·medium");
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
        openFiles: new Map(),
        getPins: () => [],
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
  console.log("  PASS");
}

function stripAnsi(text) {
  return String(text).replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
}
