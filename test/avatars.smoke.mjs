import { strict as assert } from "node:assert";
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { SettingsManager } from "@earendil-works/pi-coding-agent";

export async function runAvatarsSmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: avatar runtime and tools ---");
  const { createAvatarRuntime } = await import("../src/agent/avatars/runtime.mjs");
  const { createAvatarTools } = await import("../src/agent/avatars/tools.mjs");
  const { ContextEngine } = await import("../src/context/engine.mjs");
  const { createModelContextDumper } = await import("../src/debug/model-context-dumper.mjs");

  const dir = setupTmp();
  const created = [];
  const prompts = [];
  const payloadEvents = [];
  const dumpRoot = join(dir, "dumps");
  mkdirSync(dumpRoot, { recursive: true });
  try {
    const parentEngine = new ContextEngine({ cwd: dir, modelId: "model", provider: "test", injections: ["[test_injection]\ninherited"] });
    parentEngine.recordTurn({ userMessage: "previous user", assistantMessage: "previous assistant" });
    const runtime = createAvatarRuntime({
      cwd: dir,
      stateRoot: dir,
      provider: "test",
      modelId: "model",
      modelRegistry: { find: () => ({ id: "model", provider: "test" }), getAvailable: () => [{ id: "model", provider: "test" }] },
      settingsManager: SettingsManager.inMemory({ compaction: { enabled: false } }),
      authStorage: {},
      getCurrentModel: () => ({ id: "model", provider: "test" }),
      getParentSessionId: () => "parent-session",
      getCurrentUserRequest: () => "current user request",
      getParentEngine: () => parentEngine,
      modelContextDumper: createModelContextDumper({ enabled: true, rootDir: dumpRoot }),
      onModelPayload: (event) => payloadEvents.push(event),
      createAgentSession: async (options) => {
        created.push(options);
        assert.ok(options.tools.includes("read"));
        assert.ok(options.tools.includes("code_search"));
        assert.ok(!options.tools.includes("DispatchAvatar"));
        assert.ok(!options.tools.includes("edit_file"));
        assert.equal(options.sessionManager?.isPersisted?.(), false);
        return { session: createFakeAvatarSession(`reply ${created.length}`, prompts) };
      },
      maxConcurrent: 2,
    });

    const tools = createAvatarTools({ runtime });
    assert.deepEqual(tools.map((tool) => tool.name), ["DispatchAvatar", "AvatarStatus", "AvatarResult", "AvatarCancel"]);
    assert.match(tools[0].description, /Max model calls: 100/);

    const background = await tools[0].execute("call", {
      description: "inspect code",
      avatar: "explore",
      say: "Use the inherited parent state and focus on relevant files.",
      task: "Find the relevant files.",
      mode: "background",
    });
    assert.ok(["queued", "running", "completed"].includes(background.details.status));
    assert.equal(background.details.avatar, "explore");
    assert.equal(background.details.context_snapshot.parent_session_id, "parent-session");
    assert.equal(background.details.context_snapshot.inherited_turns, 1);

    const fetched = await tools[2].execute("call", { job_id: background.details.job_id, wait: true });
    assert.equal(fetched.details.status, "completed");
    assert.match(fetched.content[0].text, /reply 1/);

    const foreground = await tools[0].execute("call", {
      description: "review plan",
      avatar: "reviewer",
      say: "Review the current plan skeptically.",
      task: "Review this plan.",
    });
    assert.equal(foreground.details.status, "completed");
    assert.match(foreground.content[0].text, /reply 2/);

    const status = await tools[1].execute("call", {});
    assert.equal(status.details.length, 2);
    assert.equal(payloadEvents[0].metadata.avatar, "explore");
    assert.equal(payloadEvents[0].metadata.parent_session_id, "parent-session");
    assert.match(prompts[0], /\[parent_current_state\][\s\S]*current user request/);
    assert.match(prompts[0], /\[recent_chat\][\s\S]*previous user/);
    const dumpFiles = readdirSync(dumpRoot);
    assert.ok(dumpFiles.some((file) => file.includes("avatar-explore") && file.endsWith(".md")));
    const payloadFile = dumpFiles.find((file) => file.includes("avatar-explore") && file.endsWith("-payload.json"));
    assert.ok(payloadFile);
    assert.match(readFileSync(join(dumpRoot, payloadFile), "utf8"), /avatar payload/);
    runtime.dispose();
  } finally {
    cleanup(dir);
  }
  console.log("  PASS");
}

function createFakeAvatarSession(reply, prompts) {
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
      prompts.push(prompt);
      assert.match(prompt, /\[avatar_identity\]/);
      assert.match(prompt, /\[parent_current_state\]/);
      assert.match(prompt, /\[dispatch_message\]/);
      assert.match(prompt, /\[delegated_task\]/);
      assert.match(prompt, /max_model_calls=100/);
      await this.agent.onPayload({ messages: [{ role: "user", content: "avatar payload" }], tools: [{ name: "read" }] }, this.model);
      subscriber?.({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: reply } });
      subscriber?.({ type: "message_end", message: { role: "assistant", stopReason: "end_turn" } });
    },
    abort() {},
    getActiveToolNames: () => [],
    setActiveToolsByName: () => {},
    getToolDefinition: () => null,
    getSessionStats: () => ({ sessionId: "avatar-test-session" }),
    dispose: async () => {},
  };
}
