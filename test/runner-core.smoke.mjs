import { strict as assert } from "node:assert";

export async function runRunnerCoreSmoke() {
  console.log("--- smoke: March tool set ---");
  const { MARCH_BASE_TOOL_NAMES, createDefaultSessionManager, createRunner, installModelPayloadDumper, resolveRunnerSessionManager, syncEngineSessionState } = await import("../src/agent/runner.mjs");
  const { appendProviderUserMessage, estimateProviderPayloadTokens, replaceProviderContextMessages } = await import("../src/agent/model-payload-dumper.mjs");
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
  const responseDumps = [];
  const responsesAgent = {
    onPayload: async () => ({
      instructions: "[system_core]\nMarch system",
      input: [
        { role: "user", content: [{ type: "input_text", text: "[session_identity]\ncwd: /tmp" }] },
        { role: "user", content: [{ type: "input_text", text: "[recent_chat]\n[current_user]\nhello" }] },
        { type: "reasoning", id: "rs_1", summary: [] },
        { type: "function_call", call_id: "call_1", name: "read", arguments: "{}" },
        { type: "function_call_output", call_id: "call_1", output: "ok" },
      ],
    }),
  };
  installModelPayloadDumper({ agent: responsesAgent }, {
    enabled: true,
    dump: (entry) => responseDumps.push(entry),
  }, () => "user");
  await responsesAgent.onPayload({ ignored: true }, { provider: "openai-codex", id: "gpt-5.5" });
  assert.equal(responseDumps.length, 1);
  assert.ok(!responseDumps[0].prompt.includes("(no messages found)"));
  assert.ok(responseDumps[0].prompt.includes("[system_core]\nMarch system"));
  assert.ok(responseDumps[0].prompt.includes("[recent_chat]\n[current_user]\nhello"));
  assert.ok(responseDumps[0].prompt.includes("## function_call"));
  assert.ok(responseDumps[0].prompt.includes("## function_call_output"));
  const toolDumps = [];
  const longToolArgTail = "tail-keep-in-dump";
  const longToolArguments = JSON.stringify({ path: "src/main.mjs", body: `${"x".repeat(500)}${longToolArgTail}` });
  const toolsAgent = {
    onPayload: async () => ({
      messages: [
        { role: "user", content: "\x1b[31mhello\x1b[0m" },
        {
          role: "assistant",
          content: null,
          tool_calls: [{ id: "call_1", type: "function", function: { name: "read", arguments: longToolArguments } }],
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
  assert.ok(toolDumps[0].prompt.includes(longToolArgTail));
  assert.ok(!toolDumps[0].prompt.includes("...(truncated)"));
  assert.ok(toolDumps[0].prompt.includes("## tool read"));
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
  const transformedResponses = replaceProviderContextMessages({
    instructions: "Pi system",
    input: [
      { role: "user", content: [{ type: "input_text", text: "hello" }, { type: "input_image", image_url: "file://a.png" }] },
      { type: "reasoning", id: "rs_1", summary: [] },
      { type: "function_call", call_id: "call_1", name: "read", arguments: "{}" },
      { type: "function_call_output", call_id: "call_1", output: "ok" },
    ],
  }, {
    system: "[system_core]\nMarch system",
    userMessages: [
      { name: "session_identity", content: "[session_identity]\ncwd: /tmp" },
      { name: "recent_chat", content: "[recent_chat]\n## Turn 1\n[March]\nold\n\n[current_user]\nhello" },
    ],
  });
  assert.equal(transformedResponses.instructions, "[system_core]\nMarch system");
  assert.equal(transformedResponses.input[0].role, "user");
  assert.equal(transformedResponses.input[0].content[0].type, "input_text");
  assert.equal(transformedResponses.input[0].content[0].text, "[session_identity]\ncwd: /tmp");
  assert.equal(transformedResponses.input[1].content[0].text, "[recent_chat]\n## Turn 1\n[March]\nold\n\n[current_user]\nhello");
  assert.deepEqual(transformedResponses.input[1].content[1], { type: "input_image", image_url: "file://a.png" });
  assert.equal(transformedResponses.input.filter((item) => item.role === "user").length, 2);
  assert.ok(!JSON.stringify(transformedResponses.input).includes('"text":"hello"'));
  assert.deepEqual(transformedResponses.input.slice(2), [
    { type: "reasoning", id: "rs_1", summary: [] },
    { type: "function_call", call_id: "call_1", name: "read", arguments: "{}" },
    { type: "function_call_output", call_id: "call_1", output: "ok" },
  ]);
  const appendedChat = appendProviderUserMessage({ messages: [{ role: "tool", content: "ok" }] }, "[memory_hint source=\"assistant\"]");
  assert.deepEqual(appendedChat.messages.at(-1), { role: "user", content: "[memory_hint source=\"assistant\"]" });
  const appendedResponses = appendProviderUserMessage({ instructions: "sys", input: [{ type: "function_call_output", call_id: "call_1", output: "ok" }] }, "recall block");
  assert.deepEqual(appendedResponses.input.at(-1), { role: "user", content: [{ type: "input_text", text: "recall block" }] });
  console.log("  PASS");

  console.log("--- smoke: runner missing credentials message ---");
  await assert.rejects(
    () => createRunner({
      cwd: process.cwd(),
      modelId: "missing-model",
      provider: "missing-provider-smoke",
      stateRoot: process.cwd(),
      ui: {},
    }),
  );
  console.log("  PASS");
}
