import { strict as assert } from "node:assert";

export async function runRunnerCoreSmoke() {
  console.log("--- smoke: March tool set ---");
  const { MARCH_BASE_TOOL_NAMES, createDefaultSessionManager, createRunner, installModelPayloadDumper, resolveRunnerSessionManager, syncEngineSessionState } = await import("../src/agent/runner.mjs");
  const { estimateProviderPayloadTokens, replaceProviderContextMessages } = await import("../src/agent/model-payload-dumper.mjs");
  const { createSessionBinding } = await import("../src/agent/session/session-binding.mjs");
  const { ContextEngine } = await import("../src/context/engine.mjs");

  assert.deepEqual(MARCH_BASE_TOOL_NAMES, ["grep", "ls"]);
  console.log("  PASS");

  console.log("--- smoke: runner session manager seam ---");
  const manager = createDefaultSessionManager(process.cwd());
  assert.equal(manager.getCwd(), process.cwd());
  assert.equal(manager.isPersisted(), false);
  const injected = { id: "injected" };
  assert.equal(resolveRunnerSessionManager(process.cwd(), injected), injected);
  const binding = createSessionBinding({ id: "s1" });
  assert.equal(binding.get().id, "s1");
  assert.equal(binding.set({ id: "s2" }).id, "s2");
  assert.equal(binding.get().id, "s2");
  const engine = new ContextEngine({ cwd: process.cwd(), modelId: "old", provider: "deepseek", thinkingLevel: "low" });
  syncEngineSessionState(engine, {
    model: { id: "new", provider: "test" },
    thinkingLevel: "high",
    getActiveToolNames: () => ["read"],
    getToolDefinition: () => ({ description: "Read file", parameters: { properties: { path: { description: "Path" } } } }),
  });
  assert.equal(engine.modelId, "new");
  assert.equal(engine.provider, "test");
  assert.equal(engine.thinkingLevel, "high");
  assert.ok(!engine.buildContext("").includes("thinking: high"));
  console.log("  PASS");

  console.log("--- smoke: model payload dumper ---");
  const dumps = [];
  const observed = [];
  const agent = {
    onPayload: async () => ({ sent: "replacement" }),
  };
  installModelPayloadDumper({ agent }, {
    enabled: true,
    dump: (entry) => dumps.push(entry),
  }, () => "summary", (entry) => observed.push(entry));
  const sidecars = [];
  const replacement = await agent.onPayload({ sent: "original", tools: [{ name: "edit_file" }] }, { provider: "deepseek", id: "deepseek-v4-pro" });
  assert.deepEqual(replacement, { sent: "replacement" });
  assert.equal(observed.length, 1);
  assert.equal(observed[0].kind, "summary");
  assert.equal(observed[0].estimatedTokens, estimateProviderPayloadTokens({ sent: "replacement" }));
  assert.equal(dumps.length, 1);
  assert.equal(dumps[0].kind, "summary");
  assert.equal(dumps[0].metadata.payload, "provider_request");
  assert.ok(dumps[0].prompt.includes("# Messages"));
  assert.ok(dumps[0].prompt.includes("# Raw Payload"));
  const toolDumps = [];
  const toolsAgent = {
    onPayload: async () => ({
      messages: [
        { role: "user", content: "\x1b[31mhello\x1b[0m" },
        {
          role: "assistant",
          content: null,
          tool_calls: [{ id: "call_1", type: "function", function: { name: "close_file", arguments: '{"path":"src/main.mjs"}' } }],
        },
        { role: "tool", content: "Closed main.mjs", tool_call_id: "call_1" },
      ],
      tools: [{ name: "read", description: "Read a file" }],
    }),
  };
  installModelPayloadDumper({ agent: toolsAgent }, {
    enabled: true,
    dump: (entry) => {
      toolDumps.push(entry);
      return "request.md";
    },
    dumpSidecar: (entry) => sidecars.push(entry),
  }, () => "user");
  await toolsAgent.onPayload({ ignored: true }, { provider: "test", id: "model" });
  assert.equal(toolDumps.length, 1);
  assert.ok(toolDumps[0].prompt.includes("hello"));
  assert.ok(!toolDumps[0].prompt.includes("\x1b["));
  assert.ok(toolDumps[0].prompt.includes('tool_call close_file({"path":"src/main.mjs"})'));
  assert.ok(toolDumps[0].prompt.includes("## tool close_file"));
  assert.equal(sidecars.length, 2);
  assert.equal(sidecars[0].suffix, "payload");
  assert.equal(sidecars[0].value.messages[0].content, "\x1b[31mhello\x1b[0m");
  assert.equal(sidecars[1].suffix, "tools");
  assert.deepEqual(sidecars[1].value.tools, [{ name: "read", description: "Read a file" }]);
  assert.equal(sidecars[1].value.metadata.payload, "provider_tools");
  const observerOnly = [];
  const observerAgent = { onPayload: null };
  installModelPayloadDumper({ agent: observerAgent }, { enabled: false }, () => "user", (entry) => observerOnly.push(entry));
  await observerAgent.onPayload({ messages: [{ role: "user", content: [{ type: "text", text: "hello world" }] }] }, { provider: "test", id: "model" });
  assert.equal(observerOnly.length, 1);
  assert.equal(observerOnly[0].estimatedTokens, 3);
  const transformedAgent = { onPayload: null };
  installModelPayloadDumper({ agent: transformedAgent }, { enabled: false }, () => "user", null, (payload) => replaceProviderContextMessages(payload, {
    system: "[system_core]\nMarch system",
    userMessages: [{ name: "recent_chat", content: "[recent_chat]\n(no prior turns)\n\n[current_user]\nhello" }],
  }));
  const transformed = await transformedAgent.onPayload({
    messages: [
      { role: "system", content: "Pi system" },
      { role: "user", content: [{ type: "text", text: "hello" }] },
    ],
  }, { provider: "test", id: "model" });
  assert.equal(transformed.messages[0].role, "system");
  assert.equal(transformed.messages[0].content, "[system_core]\nMarch system");
  assert.equal(transformed.messages[1].role, "user");
  assert.equal(transformed.messages[1].content, "[recent_chat]\n(no prior turns)\n\n[current_user]\nhello");
  assert.equal(transformed.messages.length, 2);
  console.log("  PASS");

  console.log("--- smoke: runner missing credentials message ---");
  await assert.rejects(
    () => createRunner({
      cwd: process.cwd(),
      modelId: "missing-model",
      provider: "missing-provider-smoke",
      stateRoot: process.cwd(),
      ui: {},
      skills: [],
      pins: [],
    }),
    /Run: march provider --config/,
  );
  console.log("  PASS");
}
