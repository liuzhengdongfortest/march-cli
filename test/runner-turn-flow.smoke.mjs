import { strict as assert } from "node:assert";
import { join } from "node:path";

export async function runRunnerTurnFlowSmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: runner turn flow event integration ---");
  const { createRunner } = await import("../src/agent/runner.mjs");
  const { loadPiSessionSidecar } = await import("../src/session/sidecar.mjs");

  const dir = setupTmp();
  const projectMarchDir = join(dir, ".march");
  const previousKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = previousKey || "test-key";

  let subscriber = null;
  const promptCalls = [];
  const session = {
    model: { id: "deepseek-v4-pro", provider: "deepseek" },
    thinkingLevel: "medium",
    sessionManager: {
      isPersisted: () => true,
      getSessionFile: () => "turn-flow.jsonl",
    },
    subscribe(callback) {
      subscriber = callback;
      return () => {
        subscriber = null;
      };
    },
    async prompt(prompt) {
      promptCalls.push(prompt);
      if (promptCalls.length === 1) {
        emit({ type: "message_update", assistantMessageEvent: { type: "thinking_start" } });
        emit({ type: "message_update", assistantMessageEvent: { type: "thinking_delta", delta: "12345678" } });
        emit({ type: "message_update", assistantMessageEvent: { type: "thinking_end" } });
        emit({ type: "tool_execution_start", toolName: "read", args: { path: "a.txt" } });
        emit({ type: "tool_execution_end", toolName: "read", isError: false, result: "file body" });
        emit({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "draft text" } });
      }
    },
    getActiveToolNames: () => ["read", "write"],
    setActiveToolsByName(names) {
      this.activeTools = names;
    },
    setThinkingLevel(level) {
      this.thinkingLevel = level;
    },
    getToolDefinition: (name) => ({ description: `${name} tool`, parameters: { properties: { path: { description: "Path" } } } }),
    getSessionStats: () => ({
      sessionId: "turn-flow-session",
      userMessages: 1,
      assistantMessages: 1,
      toolCalls: 1,
      totalMessages: 3,
      tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      cost: 0,
    }),
    dispose: () => {},
  };
  function emit(event) {
    subscriber?.(event);
  }

  const calls = [];
  const ui = {
    turnStart: () => calls.push(["turnStart"]),
    turnEnd: () => calls.push(["turnEnd"]),
    textDelta: (text) => calls.push(["text", text]),
    thinkingStart: () => calls.push(["thinkingStart"]),
    thinkingDelta: (text) => calls.push(["thinking", text]),
    thinkingEnd: (tokens) => calls.push(["thinkingEnd", tokens]),
    toolStart: (name, args) => calls.push(["toolStart", name, args]),
    toolEnd: (name, isError, result) => calls.push(["toolEnd", name, isError, result]),
  };
  const runner = await createRunner({
    cwd: dir,
    modelId: "deepseek-v4-pro",
    provider: "deepseek",
    stateRoot: join(dir, ".state"),
    ui,
    skills: [],
    pins: [],
    projectMarchDir,
    syncPiSidecar: true,
    createAgentSessionImpl: async () => ({ session }),
  });

  const result = await runner.runTurn("hello", "hello");
  assert.equal(result.draft, "draft text");
  assert.equal(promptCalls.length, 1);
  assert.equal(runner.engine.turns[0].assistantMessage, "draft text");
  const sidecar = loadPiSessionSidecar({ projectMarchDir, sessionRef: "turn-flow.jsonl" });
  assert.equal(sidecar.state.turns[0].assistantMessage, "draft text");
  assert.ok(!("summary" in sidecar.state.turns[0]));
  assert.ok(calls.some((call) => call[0] === "toolStart" && call[1] === "read"));
  assert.deepEqual(calls.at(-1), ["turnEnd"]);

  if (previousKey === undefined) {
    delete process.env.DEEPSEEK_API_KEY;
  } else {
    process.env.DEEPSEEK_API_KEY = previousKey;
  }
  cleanup(dir);
  console.log("  PASS");
}
