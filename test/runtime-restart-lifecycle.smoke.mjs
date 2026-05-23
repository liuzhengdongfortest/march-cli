import { strict as assert } from "node:assert";

export async function runRuntimeRestartLifecycleSmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: runtime restart lifecycle ---");
  const { createMarchCustomTools } = await import("../src/agent/tools.mjs");
  const { runSingleShotPrompt } = await import("../src/cli/repl-loop.mjs");

  let requestedAction = null;
  const tools = createMarchCustomTools({
    cwd: process.cwd(),
    engine: {},
    ui: {},
    lifecycle: {
      requestRuntimeRestart: (action) => { requestedAction = action; },
    },
  });
  const restartTool = tools.find((tool) => tool.name === "request_runtime_restart");
  assert.ok(restartTool);
  const toolResult = await restartTool.execute("call-1", { reason: "changed tools" });
  assert.deepEqual(requestedAction, { reason: "changed tools" });
  assert.equal(toolResult.details.lifecycleAction.type, "restart_runtime");

  const dir = setupTmp();
  try {
    const output = [];
    let restarted = 0;
    const runner = {
      engine: {
        getRecentRecallMemoryIds: () => [],
        hasRenderedPendingAssistantRecallHints: () => true,
        takePendingAssistantRecallHints: () => [],
        peekPendingAssistantRecallHints: () => [],
      },
      shellRuntime: null,
      runTurn: async () => ({ draft: "ok", lifecycleAction: { type: "restart_runtime", reason: "changed tools" } }),
      restartRuntime: async () => { restarted += 1; },
    };
    const memoryStore = {
      beginTurn: () => {},
      endTurn: () => {},
      recallForUser: () => [],
    };
    const refreshStatusBar = () => {};
    refreshStatusBar.startWorking = () => {};
    refreshStatusBar.stopWorking = () => {};

    await runSingleShotPrompt({
      prompt: "reload yourself",
      runner,
      memoryStore,
      currentProject: dir,
      ui: { writeln: (line) => output.push(line), recall: () => {} },
      refreshStatusBar,
    });

    assert.equal(restarted, 1);
    assert.ok(output.join("\n").includes("March runtime 已重启"));
  } finally {
    cleanup(dir);
  }

  console.log("  PASS");
}
