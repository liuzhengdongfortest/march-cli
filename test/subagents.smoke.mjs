import { strict as assert } from "node:assert";
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { SettingsManager } from "@earendil-works/pi-coding-agent";

export async function runSubagentsSmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: subagent runtime and tools ---");
  const { createSubagentRuntime } = await import("../src/agent/subagents/runtime.mjs");
  const { createSubagentTools } = await import("../src/agent/subagents/tools.mjs");
  const { createModelContextDumper } = await import("../src/debug/model-context-dumper.mjs");

  const dir = setupTmp();
  const created = [];
  const payloadEvents = [];
  const dumpRoot = join(dir, "dumps");
  mkdirSync(dumpRoot, { recursive: true });
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
      getParentSessionId: () => "parent-session",
      modelContextDumper: createModelContextDumper({ enabled: true, rootDir: dumpRoot }),
      onModelPayload: (event) => payloadEvents.push(event),
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
    assert.equal(payloadEvents[0].metadata.subagent_type, "explore");
    assert.equal(payloadEvents[0].metadata.parent_session_id, "parent-session");
    const dumpFiles = readdirSync(dumpRoot);
    assert.ok(dumpFiles.some((file) => file.includes("subagent-explore") && file.endsWith(".md")));
    const payloadFile = dumpFiles.find((file) => file.includes("subagent-explore") && file.endsWith("-payload.json"));
    assert.ok(payloadFile);
    assert.match(readFileSync(join(dumpRoot, payloadFile), "utf8"), /subagent payload/);
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
      await this.agent.onPayload({ messages: [{ role: "user", content: "subagent payload" }], tools: [{ name: "read" }] }, this.model);
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
