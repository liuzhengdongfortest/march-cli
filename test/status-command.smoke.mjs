import { strict as assert } from "node:assert";

export async function runStatusCommandSmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: status command ---");
  const {
    formatExtensionDiagnosticSummary,
    formatStatusBarLine,
    formatStatusLine,
    getGitBranch,
    shortSessionId,
    statusCommand,
  } = await import("../src/cli/status-command.mjs");
  const dir = setupTmp();
  const engine = {
    cwd: dir,
    modelId: "deepseek-chat",
    provider: "deepseek",
    thinkingLevel: "high",
    sessionName: "Sprint",
    openFiles: new Map([["a", {}]]),
    getPins: () => ["pin.md"],
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
  assert.ok(line.includes("open:1"));
  assert.ok(line.includes("pins:1"));
  assert.equal(shortSessionId("019e0ff8-8f03-74d3-a8cb-39635eae5ca1"), "019e0ff8");
  assert.equal(formatStatusBarLine({
    engine,
    sessionState: { sessionId: "legacy1" },
    sessionStats,
    sessionSource: "pi",
    extensionDiagnostics: [{ type: "warning", message: "a" }],
    lifecycleState: { diagnostics: [] },
    gitBranch: "main",
  }), "git main  name Sprint | deepseek-chat/deepseek  think:high | 10in/20out  ext:1warning  open:1  pins:1 | pi:pi1");
  assert.equal(formatStatusBarLine({
    engine: { ...engine, openFiles: new Map(), getPins: () => [] },
    sessionState: { sessionId: "019e0ff8-8f03-74d3-a8cb-39635eae5ca1" },
    sessionStats: { sessionId: "019e0ff8-8f03-74d3-a8cb-39635eae5ca1", tokens: { input: 0, output: 0 } },
    sessionSource: "pi",
    extensionDiagnostics: [],
    lifecycleState: null,
    gitBranch: "march-cli",
  }), "git march-cli  name Sprint | deepseek-chat/deepseek  think:high | pi:019e0ff8");
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
    "git:none  session:pi1  source:pi  name:Sprint  model:deepseek-chat  provider:deepseek  thinking:high  tokens:10in/20out  ext:ok  open:1  pins:1",
  ]);
  cleanup(dir);
  console.log("  PASS");
}
