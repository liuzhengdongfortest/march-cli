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

  const statusBar = new StatusBar("Do | deepseek·medium", { cwd: "D:\\playground\\pi-go\\march-cli" });
  const [line] = statusBar.render(16);
  assert.equal(visibleWidth(line), 16);
  assert.ok(stripAnsi(line).trim().length > 0);
  const [bottomLine] = statusBar.renderBottom(32);
  assert.equal(visibleWidth(bottomLine), 32);
  assert.equal(bottomLine.includes("\x1b[48;5;236m"), false);
  assert.ok(stripAnsi(bottomLine).trimEnd().endsWith("deepseek·medium"));
  const inputLine = statusBar.renderInputLine("hello", 8);
  assert.equal(visibleWidth(inputLine), 8);
  assert.ok(inputLine.includes("\x1b[48;5;236m"));
  assert.ok(stripAnsi(inputLine).startsWith("› hello"));
  const inputLines = statusBar.renderInputLines(["\x1b[38;5;238m────────\x1b[0m", "hello", "\x1b[38;5;238m────────\x1b[0m"], 8);
  assert.deepEqual(inputLines.map(stripAnsi), ["› hello "]);

  assert.equal(statusBar.setText("Discuss | gpt-5.4·medium"), true);
  assert.equal(statusBar.setText("Discuss | gpt-5.4·medium"), false);
  const [narrow] = statusBar.renderBottom(40);
  assert.equal(visibleWidth(narrow), 40);
  assert.ok(stripAnsi(narrow).includes("gpt-5.4"));

  statusBar.setText("next");
  assert.equal(visibleWidth(statusBar.render(8)[0]), 8);
  assert.equal(visibleWidth(statusBar.renderBottom(8)[0]), 8);

  const { MainPaneLayout } = await import("../src/cli/tui/layout/main-pane-layout.mjs");
  const layoutStatusBar = new StatusBar("Do | gpt-5-codex·medium", { cwd: "D:\\work" });
  const layout = new MainPaneLayout({
    output: { setViewportHeight: () => {}, render: () => ["out"], invalidate: () => {} },
    statusBar: layoutStatusBar,
    editor: { render: () => ["────────", "hello", "────────"], invalidate: () => {} },
    terminal: { rows: 6 },
  });
  const layoutLines = layout.render(24);
  assert.equal(layoutLines.length, 6);
  assert.ok(stripAnsi(layoutLines.at(-3)).includes("D:\\work"));
  assert.equal(stripAnsi(layoutLines.at(-2)).startsWith("  "), true);
  assert.ok(layoutLines.at(-2).includes("\x1b[48;5;236m"));
  assert.ok(stripAnsi(layoutLines.at(-2)).trimStart().startsWith("› hello"));
  assert.equal(layoutLines.at(-1).includes("\x1b[48;5;236m"), false);
  assert.ok(stripAnsi(layoutLines.at(-1)).trimEnd().endsWith("gpt-5-codex·medium"));

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
