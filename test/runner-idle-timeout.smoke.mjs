import { strict as assert } from "node:assert";
import { join } from "node:path";

export async function runRunnerIdleTimeoutSmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: runner model stream idle timeout ---");
  const { createRunner } = await import("../src/agent/runner.mjs");
  const { MODEL_STREAM_IDLE_TIMEOUT_CODE } = await import("../src/agent/turn/turn-runner.mjs");

  const dir = setupTmp();
  const previousKey = process.env.DEEPSEEK_API_KEY;
  const previousTimeout = process.env.MARCH_MODEL_STREAM_IDLE_TIMEOUT_MS;
  process.env.DEEPSEEK_API_KEY = previousKey || "test-key";
  process.env.MARCH_MODEL_STREAM_IDLE_TIMEOUT_MS = "20";

  let subscriber = () => {};
  const promptCalls = [];
  let abortCalls = 0;
  const session = {
    agent: { state: { messages: [] }, onPayload: async (payload) => payload },
    model: { id: "deepseek-v4-pro", provider: "deepseek" },
    thinkingLevel: "medium",
    sessionManager: { isPersisted: () => false, getSessionFile: () => null },
    subscribe(callback) {
      subscriber = callback;
      return () => { subscriber = () => {}; };
    },
    async prompt(prompt) {
      promptCalls.push(prompt);
      if (prompt === "hang") return await new Promise(() => {});
      assert.deepEqual(this.agent.state.messages, [
        { role: "user", content: "hang" },
        { role: "assistant", content: "", stopReason: "aborted" },
      ]);
      subscriber({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "recovered" } });
    },
    abort() {
      abortCalls += 1;
      this.agent.state.messages = [
        { role: "user", content: "hang" },
        { role: "assistant", content: "", stopReason: "aborted" },
      ];
    },
    abortRetry() {},
    getActiveToolNames: () => [],
    setActiveToolsByName: () => {},
    getToolDefinition: () => null,
    getSessionStats: () => ({ sessionId: "idle-timeout-session" }),
    dispose: () => {},
  };

  try {
    const runner = await createRunner({
      cwd: dir,
      modelId: "deepseek-v4-pro",
      provider: "deepseek",
      stateRoot: join(dir, ".state"),
      ui: createSilentUi(),
      createAgentSessionImpl: async () => ({ session }),
    });

    await assert.rejects(() => runner.runTurn("hang", "hang"), (err) => {
      assert.equal(err.code, MODEL_STREAM_IDLE_TIMEOUT_CODE);
      assert.match(err.message, /Model stream idle timeout/);
      return true;
    });
    assert.equal(abortCalls, 1);

    const result = await runner.runTurn("after", "after");
    assert.equal(result.draft, "recovered");
    assert.deepEqual(promptCalls, ["hang", "after"]);
  } finally {
    if (previousKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = previousKey;
    if (previousTimeout === undefined) delete process.env.MARCH_MODEL_STREAM_IDLE_TIMEOUT_MS;
    else process.env.MARCH_MODEL_STREAM_IDLE_TIMEOUT_MS = previousTimeout;
    cleanup(dir);
  }
  console.log("  PASS");
}

function createSilentUi() {
  return {
    turnStart: () => {},
    turnEnd: () => {},
    textDelta: () => {},
    thinkingStart: () => {},
    thinkingDelta: () => {},
    thinkingEnd: () => {},
    toolStart: () => {},
    toolEnd: () => {},
    retryStart: () => {},
    retryEnd: () => {},
    status: () => {},
  };
}
