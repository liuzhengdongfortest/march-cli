import { strict as assert } from "node:assert";
import { SettingsManager } from "@earendil-works/pi-coding-agent";

export async function runSubagentsSmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: subagent runtime and tools ---");
  const { createSubagentRuntime } = await import("../src/agent/subagents/runtime.mjs");
  const { createSubagentTools } = await import("../src/agent/subagents/tools.mjs");

  const dir = setupTmp();
  const created = [];
  try {
    const runtime = createSubagentRuntime({
      cwd: dir,
      stateRoot: dir,
      provider: "test",
      modelId: "model",
      modelRegistry: { find: () => ({ id: "model", provider: "test" }), getAvailable: () => [{ id: "model", provider: "test" }] },
      settingsManager: SettingsManager.inMemory({ compaction: { enabled: false } }),
      authStorage: {},
      getCurrentModel: () => ({ id: "model", provider: "test" }),
      createAgentSession: async (options) => {
        created.push(options);
        assert.ok(options.tools.includes("read"));
        assert.ok(options.tools.includes("code_search"));
        assert.ok(!options.tools.includes("Agent"));
        assert.ok(!options.tools.includes("edit_file"));
        assert.equal(options.sessionManager?.isPersisted?.(), false);
        return { session: createFakeSubagentSession(`reply ${created.length}`) };
      },
      maxConcurrent: 2,
    });

    const tools = createSubagentTools({ runtime });
    assert.deepEqual(tools.map((tool) => tool.name), ["Agent", "AgentStatus", "AgentResult", "AgentCancel"]);

    const background = await tools[0].execute("call", {
      description: "inspect code",
      subagent_type: "explore",
      prompt: "Find the relevant files.",
      mode: "background",
    });
    assert.ok(["queued", "running", "completed"].includes(background.details.status));

    const fetched = await tools[2].execute("call", { job_id: background.details.job_id, wait: true });
    assert.equal(fetched.details.status, "completed");
    assert.match(fetched.content[0].text, /reply 1/);

    const foreground = await tools[0].execute("call", {
      description: "review plan",
      subagent_type: "reviewer",
      prompt: "Review this plan.",
    });
    assert.equal(foreground.details.status, "completed");
    assert.match(foreground.content[0].text, /reply 2/);

    const status = await tools[1].execute("call", {});
    assert.equal(status.details.length, 2);
    runtime.dispose();
  } finally {
    cleanup(dir);
  }
  console.log("  PASS");
}

function createFakeSubagentSession(reply) {
  let subscriber = null;
  return {
    agent: {
      state: { messages: [] },
      reset() { this.state.messages = []; },
      onPayload: async (payload) => payload,
    },
    model: { id: "model", provider: "test" },
    thinkingLevel: "medium",
    subscribe(callback) {
      subscriber = callback;
      return () => { subscriber = null; };
    },
    async prompt(prompt) {
      assert.match(prompt, /\[delegated_task\]/);
      subscriber?.({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: reply } });
      subscriber?.({ type: "message_end", message: { role: "assistant", stopReason: "end_turn" } });
    },
    abort() {},
    getActiveToolNames: () => [],
    setActiveToolsByName: () => {},
    getToolDefinition: () => null,
    getSessionStats: () => ({ sessionId: "subagent-test-session" }),
    dispose: async () => {},
  };
}
