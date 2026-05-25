import { strict as assert } from "node:assert";
import { join } from "node:path";

export async function runRunnerModelErrorSmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: runner model error propagation ---");
  const { createRunner } = await import("../src/agent/runner.mjs");

  const dir = setupTmp();
  const previousKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = previousKey || "test-key";

  let subscriber = () => {};
  const session = {
    agent: { state: { messages: [] }, onPayload: async (payload) => payload },
    model: { id: "deepseek-v4-pro", provider: "deepseek" },
    thinkingLevel: "medium",
    sessionManager: { isPersisted: () => false, getSessionFile: () => null },
    subscribe(callback) {
      subscriber = callback;
      return () => { subscriber = () => {}; };
    },
    async prompt() {
      subscriber({
        type: "message_end",
        message: {
          role: "assistant",
          content: [],
          stopReason: "error",
          errorMessage: "WebSocket closed 1009 message too big",
        },
      });
    },
    abort() {},
    abortRetry() {},
    getActiveToolNames: () => [],
    setActiveToolsByName: () => {},
    getToolDefinition: () => null,
    getSessionStats: () => ({ sessionId: "model-error-session" }),
    dispose: () => {},
  };

  try {
    const notifications = [];
    const runner = await createRunner({
      cwd: dir,
      modelId: "deepseek-v4-pro",
      provider: "deepseek",
      stateRoot: join(dir, ".state"),
      ui: createSilentUi(),
      createAgentSessionImpl: async () => ({ session }),
      turnNotifier: {
        notifyTurnEnd(event) {
          notifications.push(event);
          return { ok: true };
        },
      },
    });

    await assert.rejects(() => runner.runTurn("hello", "hello"), (err) => {
      assert.equal(err.code, "MODEL_PROVIDER_ERROR");
      assert.match(err.message, /WebSocket closed 1009/);
      return true;
    });
    assert.equal(runner.engine.turns.length, 0);
    assert.equal(notifications.at(-1).status, "error");
    assert.match(notifications.at(-1).errorMessage, /WebSocket closed 1009/);
  } finally {
    if (previousKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = previousKey;
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
