import { strict as assert } from "node:assert";

export async function runStatusCommandSmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: status command ---");
  const {
    formatExtensionDiagnosticSummary,
    formatCompactTokenCount,
    formatStatusBarLine,
    formatStatusLine,
    getGitBranch,
    shortSessionId,
    statusCommand,
  } = await import("../src/cli/commands/status-command.mjs");
  const dir = setupTmp();
  const engine = {
    cwd: dir,
    modelId: "deepseek-chat",
    provider: "deepseek",
    thinkingLevel: "high",
    sessionName: "Sprint",
  };
  const sessionStats = {
    sessionId: "pi1",
    tokens: { input: 10, output: 20 },
  };

  assert.equal(formatExtensionDiagnosticSummary(), "ok");
  assert.equal(formatExtensionDiagnosticSummary(
    [{ type: "warning", message: "a" }],
    { diagnostics: [{ type: "error", message: "b" }, { type: "warning", message: "c" }] },
  ), "1error,2warning");
  assert.equal(formatCompactTokenCount(980), "980");
  assert.equal(formatCompactTokenCount(11300), "11.3K");
  assert.equal(formatCompactTokenCount(1200000), "1.2M");
  const line = formatStatusLine({
    engine,
    sessionState: { sessionId: "legacy1" },
    sessionStats,
    sessionSource: "pi",
    extensionDiagnostics: [{ type: "warning", message: "a" }],
    lifecycleState: { diagnostics: [] },
    gitBranch: "main",
  });
  assert.ok(line.includes("git:main"));
  assert.ok(line.includes("session:pi1"));
  assert.ok(line.includes("source:pi"));
  assert.ok(line.includes("name:Sprint"));
  assert.ok(line.includes("model:deepseek-chat"));
  assert.ok(line.includes("provider:deepseek"));
  assert.ok(line.includes("thinking:high"));
  assert.ok(line.includes("tokens:10in/20out"));
  assert.ok(line.includes("ext:1warning"));
  assert.equal(shortSessionId("019e0ff8-8f03-74d3-a8cb-39635eae5ca1"), "019e0ff8");
  const doStatusBar = stripAnsi(formatStatusBarLine({
    engine,
    sessionState: { sessionId: "legacy1" },
    sessionStats,
    sessionSource: "pi",
    extensionDiagnostics: [{ type: "warning", message: "a" }],
    lifecycleState: { diagnostics: [] },
    gitBranch: "main",
  }));
  assert.equal(doStatusBar, "Do | deepseek-chat·high");
  assert.equal(doStatusBar.includes("git"), false);
  assert.equal(doStatusBar.includes("/deepseek"), false);
  assert.equal(doStatusBar.includes("think:"), false);
  assert.equal(doStatusBar.includes("ext:"), false);
  assert.equal(doStatusBar.includes("pi:"), false);
  assert.equal(stripAnsi(formatStatusBarLine({
    engine,
    sessionState: { sessionId: "019e0ff8-8f03-74d3-a8cb-39635eae5ca1" },
    sessionStats: { sessionId: "019e0ff8-8f03-74d3-a8cb-39635eae5ca1", tokens: { input: 0, output: 0 } },
    sessionSource: "pi",
    extensionDiagnostics: [],
    lifecycleState: null,
    gitBranch: "march-cli",
    mode: "discuss",
  })), "Discuss | deepseek-chat·high");
  assert.equal(stripAnsi(formatStatusBarLine({
    engine,
    mode: "do",
    contextTokens: 11300,
  })), "Do | deepseek-chat·high | 11.3K");
  assert.equal(stripAnsi(formatStatusBarLine({
    engine,
    mode: "do",
    contextTokens: 11300,
  })).includes("ctx:"), false);
  const branch = getGitBranch(dir);
  assert.ok(branch === null || typeof branch === "string");
  assert.deepEqual(statusCommand({
    runner: {
      engine,
      getSessionStats: () => sessionStats,
      getExtensionDiagnostics: () => [],
      getExtensionLifecycleState: () => null,
    },
    sessionState: { sessionId: "legacy1" },
    sessionSource: "pi",
    gitBranch: null,
  }), [
    "git:none  session:pi1  source:pi  name:Sprint  model:deepseek-chat  provider:deepseek  thinking:high  tokens:10in/20out  ext:ok",
  ]);
  cleanup(dir);
  console.log("  PASS");
}

function stripAnsi(text) {
  return String(text).replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
}
