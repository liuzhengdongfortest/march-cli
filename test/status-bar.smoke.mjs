import { strict as assert } from "node:assert";
import { visibleWidth } from "@mariozechner/pi-tui";

export async function runStatusBarSmoke() {
  console.log("--- smoke: status bar ---");
  const {
    StatusBar,
    normalizeStatusText,
    padToWidth,
  } = await import("../src/cli/status-bar.mjs");
  const { createStatusLineUpdater } = await import("../src/cli/status-line-updater.mjs");

  assert.equal(normalizeStatusText("  git:main   session:abc  "), "git:main session:abc");
  assert.equal(normalizeStatusText(""), "March");
  assert.equal(visibleWidth(padToWidth("abc", 8)), 8);

  const statusBar = new StatusBar("git:main session:abc model:deepseek");
  const [line] = statusBar.render(16);
  assert.equal(visibleWidth(line), 16);
  assert.ok(line.includes("\x1b[7;90m"));

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
  const statusLine = update();
  assert.equal(seen.length, 1);
  assert.equal(seen[0], statusLine);
  assert.ok(statusLine.includes("session:pi1"));
  assert.ok(statusLine.includes("tokens:3in/5out"));
  console.log("  PASS");
}
