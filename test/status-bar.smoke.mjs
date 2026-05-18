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

  const statusBar = new StatusBar("Do | deepseek·medium | lsp:ts✓ | 11.3K", { cwd: "D:\\playground\\pi-go\\march-cli" });
  const [line] = statusBar.render(64);
  assert.equal(visibleWidth(line), 64);
  const topPlain = stripAnsi(line);
  assert.ok(topPlain.trimStart().startsWith("march-cli • LSP [ts] • 11.3K"));
  assert.ok(topPlain.indexOf("11.3K") < 32);
  const bottomLines = statusBar.renderBottom(64);
  assert.deepEqual(bottomLines.map(stripAnsi), ["", stripAnsi(bottomLines.at(-1))]);
  const bottomLine = bottomLines.at(-1);
  assert.equal(visibleWidth(bottomLine), 64);
  assert.equal(bottomLine.includes("\x1b[48;2;32;34;38m"), false);
  const bottomPlain = stripAnsi(bottomLine);
  assert.ok(bottomPlain.trimStart().startsWith("Do"));
  assert.ok(bottomLine.includes("\x1b[38;2;245;167;66mDo\x1b[0m"));
  assert.ok(bottomPlain.trimEnd().endsWith("deepseek • medium"));
  statusBar.setText("Do | deepseek·medium | lsp:ts✓ | ⠋ Working | 11.3K");
  const workingBottomPlain = stripAnsi(statusBar.renderBottom(64).at(-1));
  assert.ok(workingBottomPlain.trimStart().startsWith("⠋ Working · Do"));
  assert.ok(workingBottomPlain.trimEnd().endsWith("deepseek • medium"));
  const inputLine = statusBar.renderInputLine("hello", 80);
  assert.equal(visibleWidth(inputLine), 79);
  assert.ok(inputLine.includes("\x1b[48;2;32;34;38m"));
  assert.ok(stripAnsi(inputLine).startsWith("▌hello"));
  const cjkInputLine = statusBar.renderInputLines(["你好，我能复制嘛？:c"], 80).at(1);
  assert.equal(visibleWidth(cjkInputLine), 79);
  assert.ok(stripAnsi(cjkInputLine).startsWith("▌你好，我能复制嘛？:c"));
  const inputLines = statusBar.renderInputLines(["\x1b[38;5;238m────────\x1b[0m", "hello", "\x1b[38;5;238m────────\x1b[0m"], 80);
  assert.deepEqual(inputLines.map((l) => stripAnsi(l).trimEnd()), ["", "▌hello", ""]);
  assert.equal(inputLines.every((l) => l.includes("\x1b[48;2;32;34;38m")), true);
  assert.equal(statusBar.setText("Discuss | gpt-5.4·medium"), true);
  assert.ok(statusBar.renderBottom(64).at(-1).includes("\x1b[32mDiscuss\x1b[0m"));
  assert.equal(statusBar.setText("Discuss | gpt-5.4·medium"), false);
  const narrow = statusBar.renderBottom(40).at(-1);
  assert.equal(visibleWidth(narrow), 40);
  assert.ok(stripAnsi(narrow).includes("gpt-5.4"));
  assert.ok(stripAnsi(narrow).includes("medium"));

  statusBar.setText("next");
  assert.ok(visibleWidth(statusBar.render(8)[0]) <= 8);
  assert.equal(visibleWidth(statusBar.renderBottom(8).at(-1)), 8);

  const { MainPaneLayout } = await import("../src/cli/tui/layout/main-pane-layout.mjs");
  const layoutStatusBar = new StatusBar("Do | gpt-5-codex·medium | lsp:ts✓ | 11.3K", { cwd: "D:\\work\\march-cli" });
  const layout = new MainPaneLayout({
    output: { setViewportHeight: () => {}, render: () => ["out"], invalidate: () => {} },
    statusBar: layoutStatusBar,
    editor: { render: () => ["────────", "hello", "────────"], invalidate: () => {} },
    terminal: { rows: 9 },
  });
  const layoutLines = layout.render(80);
  assert.ok(stripAnsi(layoutLines.at(-7)).includes("march-cli • LSP [ts] • 11.3K"));
  assert.ok(stripAnsi(layoutLines.at(-7)).indexOf("11.3K") < 32);
  assert.equal(stripAnsi(layoutLines.at(-6)), "");
  assert.ok(layoutLines.at(-5).includes("\x1b[48;2;32;34;38m"));
  assert.equal(stripAnsi(layoutLines.at(-5)).trim(), "");
  assert.ok(layoutLines.at(-4).includes("\x1b[48;2;32;34;38m"));
  assert.equal(visibleWidth(layoutLines.at(-4)), 79);
  assert.ok(stripAnsi(layoutLines.at(-4)).startsWith("▌hello"));
  assert.equal(stripAnsi(layoutLines.at(-3)).trim(), "");
  assert.ok(layoutLines.at(-3).includes("\x1b[48;2;32;34;38m"));
  assert.equal(stripAnsi(layoutLines.at(-2)), "");
  assert.equal(layoutLines.at(-1).includes("\x1b[48;2;32;34;38m"), false);
  assert.ok(stripAnsi(layoutLines.at(-1)).includes("gpt-5-codex • medium"));
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
