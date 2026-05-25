import { strict as assert } from "node:assert";
import { join } from "node:path";

export async function runRunnerProviderRetrySettingsSmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: runner provider retry settings ---");
  const { createRunner } = await import("../src/agent/runner.mjs");

  const dir = setupTmp();
  const previousKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = previousKey || "test-key";

  try {
    let capturedSettingsManager = null;
    await createRunner({
      cwd: dir,
      modelId: "deepseek-v4-pro",
      provider: "deepseek",
      stateRoot: join(dir, ".state"),
      ui: createSilentUi(),
      createAgentSessionImpl: async ({ settingsManager }) => {
        capturedSettingsManager = settingsManager;
        return { session: createStubSession() };
      },
    });

    assert.deepEqual(capturedSettingsManager.getProviderRetrySettings(), {
      timeoutMs: 20000,
      maxRetries: 3,
      maxRetryDelayMs: 60000,
    });
  } finally {
    if (previousKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = previousKey;
    cleanup(dir);
  }
  console.log("  PASS");
}

function createStubSession() {
  return {
    agent: { state: { messages: [] }, onPayload: async (payload) => payload },
    model: { id: "deepseek-v4-pro", provider: "deepseek" },
    thinkingLevel: "medium",
    sessionManager: { isPersisted: () => false, getSessionFile: () => null },
    subscribe() { return () => {}; },
    getActiveToolNames: () => [],
    setActiveToolsByName: () => {},
    getToolDefinition: () => null,
    getSessionStats: () => ({ sessionId: "provider-retry-settings-session" }),
    dispose: () => {},
  };
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
