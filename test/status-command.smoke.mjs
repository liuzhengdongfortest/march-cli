import { strict as assert } from "node:assert";

export async function runStatusCommandSmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: status command ---");
  const {
    formatExtensionDiagnosticSummary,
    formatCompactTokenCount,
    formatProviderQuotaLines,
    formatQuotaBar,
    formatQuotaReset,
    formatStatusBarLine,
    formatStatusLine,
    getGitBranch,
    shortSessionId,
    statusCommand,
    statusBarLine,
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
  const resetAt = new Date(2026, 4, 31, 15, 26).toISOString();
  const providerQuota = { limits: [{ windows: [
    { label: "5h", usedPercent: 18, remainingPercent: 82, resetsAt: null },
    { label: "weekly", usedPercent: 3, remainingPercent: 97, resetsAt: resetAt },
  ] }] };
  assert.equal(formatQuotaBar(82, 20), "[████████████████░░░░]");
  assert.equal(formatQuotaReset(resetAt), "resets 15:26 on 31 May");
  assert.deepEqual(formatProviderQuotaLines(providerQuota), [
    "5h limit:                    [████████████████░░░░] 82% left (reset unknown)",
    "Weekly limit:                [███████████████████░] 97% left (resets 15:26 on 31 May)",
  ]);
  const line = formatStatusLine({
    engine,
    sessionState: { sessionId: "legacy1" },
    sessionStats,
    sessionSource: "pi",
    extensionDiagnostics: [{ type: "warning", message: "a" }],
    lifecycleState: { diagnostics: [] },
    gitBranch: "main",
  });
  assert.ok(line.includes("Workspace: git:main"));
  assert.ok(line.includes("Session:   id:pi1"));
  assert.ok(line.includes("source:pi"));
  assert.ok(line.includes("name:Sprint"));
  assert.ok(line.includes("Model:     model:deepseek-chat  provider:deepseek  thinking:high"));
  assert.ok(line.includes("Usage:     tokens:10in/20out  ext:1warning"));
  assert.equal(shortSessionId("019e0ff8-8f03-74d3-a8cb-39635eae5ca1"), "019e0ff8");
  const rawDoStatusBar = formatStatusBarLine({
    engine,
    sessionState: { sessionId: "legacy1" },
    sessionStats,
    sessionSource: "pi",
    extensionDiagnostics: [{ type: "warning", message: "a" }],
    lifecycleState: { diagnostics: [] },
    gitBranch: "main",
  });
  assert.ok(rawDoStatusBar.startsWith("\x1b[38;2;245;167;66mDo\x1b[0m"));
  const doStatusBar = stripAnsi(rawDoStatusBar);
  assert.equal(doStatusBar, "Do | deepseek-chat·high");
  assert.equal(doStatusBar.includes("git"), false);
  assert.equal(doStatusBar.includes("/deepseek"), false);
  assert.equal(doStatusBar.includes("think:"), false);
  assert.equal(doStatusBar.includes("ext:"), false);
  assert.equal(doStatusBar.includes("pi:"), false);
  const rawDiscussStatusBar = formatStatusBarLine({
    engine,
    sessionState: { sessionId: "019e0ff8-8f03-74d3-a8cb-39635eae5ca1" },
    sessionStats: { sessionId: "019e0ff8-8f03-74d3-a8cb-39635eae5ca1", tokens: { input: 0, output: 0 } },
    sessionSource: "pi",
    extensionDiagnostics: [],
    lifecycleState: null,
    gitBranch: "march-cli",
    mode: "discuss",
  });
  assert.ok(rawDiscussStatusBar.startsWith("\x1b[32mDiscuss\x1b[0m"));
  assert.equal(stripAnsi(rawDiscussStatusBar), "Discuss | deepseek-chat·high");
  assert.equal(stripAnsi(formatStatusBarLine({
    engine,
    mode: "do",
    contextTokens: 11300,
  })), "Do | deepseek-chat·high | 11.3K");
  assert.equal(stripAnsi(formatStatusBarLine({
    engine,
    mode: "do",
    providerQuota,
    contextTokens: 11300,
  })), "Do | deepseek-chat·high | 11.3K");
  assert.equal(stripAnsi(formatStatusBarLine({
    engine,
    mode: "do",
    contextTokens: 6000,
    activity: { frame: "⠋", label: "Working" },
  })), "Do | deepseek-chat·high | ⠋ Working | 6K");
  assert.equal(stripAnsi(formatStatusBarLine({
    engine,
    mode: "do",
    contextTokens: 6000,
    activity: { frame: "x", label: "Aborted" },
  })), "Do | deepseek-chat·high | x Aborted | 6K");
  assert.equal(stripAnsi(formatStatusBarLine({
    engine,
    mode: "do",
    contextTokens: 11300,
  })).includes("ctx:"), false);
  const statusBarWithoutCwd = stripAnsi(statusBarLine({
    runner: {
      engine: {
        get cwd() {
          throw new Error("status bar must not read cwd");
        },
        modelId: "deepseek-chat",
        provider: "deepseek",
        thinkingLevel: "high",
      },
    },
  }));
  assert.equal(statusBarWithoutCwd, "Do | deepseek-chat·high");
  const branch = getGitBranch(dir);
  assert.ok(branch === null || typeof branch === "string");
  assert.deepEqual(statusCommand({
    runner: {
      engine,
      getSessionStats: () => sessionStats,
      getExtensionDiagnostics: () => [],
      getExtensionLifecycleState: () => null,
      getCachedProviderQuotaSnapshot: () => providerQuota,
    },
    sessionState: { sessionId: "legacy1" },
    sessionSource: "pi",
    gitBranch: null,
  }), [
    "Workspace: git:none",
    "Session:   id:pi1  source:pi  name:Sprint",
    "Model:     model:deepseek-chat  provider:deepseek  thinking:high",
    "Usage:     tokens:10in/20out  ext:ok",
    "5h limit:                    [████████████████░░░░] 82% left (reset unknown)",
    "Weekly limit:                [███████████████████░] 97% left (resets 15:26 on 31 May)",
  ]);
  cleanup(dir);
  console.log("  PASS");
}

function stripAnsi(text) {
  return String(text).replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
}
