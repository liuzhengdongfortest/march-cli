import { strict as assert } from "node:assert";

export async function runStatusCommandSmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: status command ---");
  const {
    formatExtensionDiagnosticSummary,
    formatStatusLine,
    getGitBranch,
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
