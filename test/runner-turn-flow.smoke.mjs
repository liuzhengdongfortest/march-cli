import { strict as assert } from "node:assert";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

let currentPiExtensions = [];

export async function runRunnerTurnFlowSmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: runner turn flow event integration ---");
  const { createRunner } = await import("../src/agent/runner.mjs");
  const { loadPiSessionSidecar } = await import("../src/session/sidecar.mjs");

  const dir = setupTmp();
  writeFileSync(join(dir, "AGENTS.md"), "Pi project context must not be loaded directly.");
  const projectMarchDir = join(dir, ".march");
  const previousKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = previousKey || "test-key";

  let subscriber = null;
  let sessionName = "";
  const sessionNameCalls = [];
  const promptCalls = [];
  const providerPayloads = [];
  const session = {
    agent: {
      state: { messages: [{ role: "user", content: "stale context" }] },
      onPayload: async (payload) => payload,
      reset() {
        this.state.messages = [];
      },
    },
    model: { id: "deepseek-v4-pro", provider: "deepseek" },
    get sessionName() {
      return sessionName || undefined;
    },
    setSessionName(name) {
      sessionName = name;
      sessionNameCalls.push(name);
    },
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
      const isContinuation = prompt === "second";
      if (isContinuation) {
        assert.deepEqual(this.agent.state.messages, [
          { role: "user", content: "aborted question" },
          { role: "assistant", content: "", stopReason: "aborted" },
        ]);
      } else {
        assert.deepEqual(this.agent.state.messages, []);
      }
      providerPayloads.push(await buildProviderPayload(this, prompt));
      if (promptCalls.length === 1) {
        await emitAssistantUpdate({ type: "thinking_start" });
        await emitAssistantUpdate({ type: "thinking_delta", delta: "12345678" });
        await emitAssistantUpdate({ type: "thinking_end" });
        emit({ type: "tool_execution_start", toolName: "read", args: { path: "a.txt" } });
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(recallCalls, 0);
        emit({ type: "tool_execution_end", toolName: "read", isError: false, result: "file body" });
        providerPayloads.push(await buildProviderPayload(this, prompt, [
          { role: "assistant", content: [{ type: "thinking", thinking: "12345678" }, { type: "toolCall", id: "call_1", name: "read", arguments: { path: "a.txt" } }] },
          { role: "toolResult", content: "file body", toolCallId: "call_1" },
        ]));
        await emitAssistantUpdate({ type: "text_delta", delta: "draft text" });
      } else if (promptCalls.length === 3) {
        emit({ type: "tool_execution_start", toolName: "read", args: { path: "tool-only.txt" } });
        await emitAssistantUpdate({ type: "thinking_start" });
        await emitAssistantUpdate({ type: "thinking_end", content: "late thinking memory text" });
        emit({ type: "tool_execution_end", toolName: "read", isError: false, result: "tool only body" });
        await new Promise((resolve) => setImmediate(resolve));
        providerPayloads.push(await buildProviderPayload(this, prompt, [
          { role: "assistant", content: [{ type: "thinking", thinking: "late thinking memory text" }, { type: "toolCall", id: "call_2", name: "read", arguments: { path: "tool-only.txt" } }] },
          { role: "toolResult", content: "tool only body", toolCallId: "call_2" },
        ]));
      }
    },
    abort() {
      this.agent.state.messages = [
        { role: "user", content: "aborted question" },
        { role: "assistant", content: "", stopReason: "aborted" },
      ];
      return true;
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
    sendCustomMessage() {
      throw new Error("mid-turn recall should be injected by the context hook");
    },
    dispose: () => {},
  };
  function emit(event) {
    subscriber?.(event);
  }
  async function emitAssistantUpdate(assistantMessageEvent) {
    const event = { type: "message_update", message: { role: "assistant", content: [] }, assistantMessageEvent };
    for (const handler of extensionHandlers("message_update")) await handler(event, { model: session.model });
    emit(event);
  }

  const calls = [];
  let recallCalls = 0;
  const memoryStore = {
    recallForAssistant(text, options) {
      if (!text) return { hints: [], report: null };
      recallCalls += 1;
      if (recallCalls === 1) assert.deepEqual([...options.excludedIds], []);
      if (recallCalls === 1) {
        assert.ok(text.includes("12345678"));
        assert.ok(!text.includes("draft text"));
        assert.ok(!text.includes("→ read"));
        return { hints: [{ id: "mem_thinking", name: "Thinking memory", description: "Matched from thinking text." }], report: { threshold: 0.5, candidates: [{ id: "mem_thinking", name: "Thinking memory", score: 0.9, recalled: true }] } };
      }
      if (recallCalls === 2) {
        assert.equal(text, "draft text");
        return { hints: [{ id: "mem_draft", name: "Draft memory", description: "Matched from visible assistant text." }], report: { threshold: 0.5, candidates: [{ id: "mem_draft", name: "Draft memory", score: 0.8, recalled: true }] } };
      }
      if (recallCalls === 3) {
        assert.equal(text, "late thinking memory text");
        return { hints: [{ id: "mem_late_thinking", name: "Late thinking memory", description: "Matched from thinking end content." }], report: { threshold: 0.5, candidates: [{ id: "mem_late_thinking", name: "Late thinking memory", score: 0.85, recalled: true }] } };
      }
      return { hints: [], report: { threshold: 0.5, candidates: [] } };
    },
  };
  const ui = {
    turnStart: () => calls.push(["turnStart"]),
    turnEnd: () => calls.push(["turnEnd"]),
    textDelta: (text) => calls.push(["text", text]),
    thinkingStart: () => calls.push(["thinkingStart"]),
    thinkingDelta: (text) => calls.push(["thinking", text]),
    thinkingEnd: (tokens) => calls.push(["thinkingEnd", tokens]),
    toolStart: (name, args) => calls.push(["toolStart", name, args]),
    toolEnd: (name, isError, result) => calls.push(["toolEnd", name, isError, result]),
    recall: ({ hints, report, variant }) => calls.push(["recall", hints.map((hint) => hint.id), report?.candidates?.length ?? 0, variant]),
  };
  const runner = await createRunner({
    cwd: dir,
    modelId: "deepseek-v4-pro",
    provider: "deepseek",
    stateRoot: join(dir, ".state"),
    ui,
    memoryRoot: join(projectMarchDir, "memories"),
    memoryStore,
    projectMarchDir,
    syncPiSidecar: true,
    createAgentSessionImpl: async (options) => {
      assert.deepEqual(options.resourceLoader.getAgentsFiles(), { agentsFiles: [] });
      currentPiExtensions = options.resourceLoader.getExtensions().extensions;
      return { session };
    },
  });

  const result = await runner.runTurn("hello", "hello");
  assert.equal(result.draft, "draft text");
  assert.equal(promptCalls.length, 1);
  assert.equal(providerPayloads.length, 2);
  assert.ok(!promptCalls[0].includes("[system_core]"));
  assert.ok(promptCalls[0].includes("[session_identity]"));
  assert.ok(promptCalls[0].includes("[current_user]\nhello"));
  assert.equal(providerPayloads[0].messages[0].role, "system");
  assert.ok(providerPayloads[0].messages[0].content.includes("[system_core]"));
  assert.ok(!providerPayloads[0].messages[0].content.includes("[workspace_status]"));
  assert.ok(!providerPayloads[0].messages[0].content.includes("[recent_chat]"));
  assert.equal(providerPayloads[0].messages[1].role, "user");
  assert.ok(!providerPayloads[0].messages.some((message) => message.role === "user" && message.content.includes("[workspace_status]")));
  assert.ok(providerPayloads[0].messages.some((message) => message.role === "user" && providerMessageText(message).includes("[session_identity]")));
  assert.ok(providerPayloads[0].messages.some((message) => message.role === "user" && providerMessageText(message).includes(`memory_root: ${join(projectMarchDir, "memories")}`)));
  assert.ok(!providerPayloads[0].messages.some((message) => message.role === "user" && providerMessageText(message).includes("[runtime_status]")));
  assert.ok(!providerPayloads[0].messages.some((message, index) => index > 0 && message.content.includes("[system_core]")));
  assert.ok(!providerPayloads[0].messages.some((message, index) => index > 0 && message.role === "system"));
  assert.ok(providerMessageText(providerPayloads[0].messages.at(-1)).includes("[recent_chat]"));
  assert.ok(providerMessageText(providerPayloads[0].messages.at(-1)).includes("[current_user]\nhello"));
  assert.equal(countUserMessagesContaining(providerPayloads[0].messages, "hello"), 1);
  assert.equal(providerPayloads[1].messages[0].role, "system");
  assert.ok(providerPayloads[1].messages[0].content.includes("[system_core]"));
  assert.ok(providerPayloads[1].messages.some((message) => providerMessageText(message).includes("[session_identity]")));
  assert.ok(providerPayloads[1].messages.some((message) => providerMessageText(message).includes("[current_user]\nhello")));
  assert.ok(providerPayloads[1].messages.some((message) => message.role === "tool" && providerMessageText(message).includes("file body")));
  assert.equal(providerPayloads[1].messages.filter((message) => providerMessageText(message).includes("mem_thinking")).length, 1);
  assert.ok(providerMessageText(providerPayloads[1].messages.at(-1)).includes("mem_thinking | Thinking memory | Matched from thinking text."));
  assert.equal(runner.engine.turns[0].assistantRecallHints.length, 2);
  assert.equal(runner.engine.turns[0].assistantRecallHints[0].id, "mem_thinking");
  assert.equal(runner.engine.turns[0].assistantRecallHints[1].id, "mem_draft");
  assert.ok(calls.some((call) => call[0] === "recall" && call[1].includes("mem_thinking") && !call[1].includes("mem_draft")));
  assert.equal(runner.engine.turns[0].assistantMessage, "draft text");
  assert.equal(runner.engine.turns[0].assistantContext, "12345678\n→ read · a.txt\ndraft text");
  assert.equal(runner.engine.sessionName, "hello");
  assert.deepEqual(sessionNameCalls, ["hello"]);

  assert.equal(runner.setSessionName("Manual Name"), "Manual Name");
  assert.equal(runner.engine.sessionName, "Manual Name");
  assert.deepEqual(sessionNameCalls, ["hello", "Manual Name"]);

  runner.abort();
  await runner.runTurn("second", "second");
  assert.equal(promptCalls.length, 2);
  assert.ok(!promptCalls[1].includes("[system_core]"));
  assert.equal(providerPayloads[2].messages[0].role, "system");
  assert.ok(!providerPayloads[2].messages[0].content.includes("[system_core]"));
  assert.equal(providerPayloads[2].messages[1].role, "user");
  assert.equal(providerPayloads[2].messages[1].content, "aborted question");
  assert.equal(providerPayloads[2].messages[2].stopReason, "aborted");
  assert.equal(providerPayloads[2].messages.at(-1).role, "user");
  assert.equal(providerMessageText(providerPayloads[2].messages.at(-1)), "second");
  assert.ok(!providerPayloads[2].messages.some((message) => providerMessageText(message).includes("[system_core]")));
  assert.ok(!providerPayloads[2].messages.some((message) => providerMessageText(message).includes("[workspace_status]")));
  assert.ok(!providerPayloads[2].messages.some((message) => providerMessageText(message).includes("[recent_chat]")));

  await runner.runTurn("third", "third");
  assert.equal(promptCalls.length, 3);
  assert.ok(!promptCalls[2].includes("[system_core]"));
  assert.ok(promptCalls[2].includes("[session_identity]"));
  assert.ok(promptCalls[2].includes("[current_user]\nthird"));
  assert.ok(providerPayloads[3].messages[0].content.includes("[system_core]"));
  assert.ok(!providerPayloads[3].messages[0].content.includes("[recent_chat]"));
  assert.ok(providerMessageText(providerPayloads[3].messages.at(-1)).includes("[recent_chat]"));
  assert.ok(providerMessageText(providerPayloads[3].messages.at(-1)).includes("draft text"));
  assert.ok(providerMessageText(providerPayloads[3].messages.at(-1)).includes("→ read · a.txt"));
  assert.ok(!providerMessageText(providerPayloads[3].messages.at(-1)).includes("file body"));
  assert.ok(providerMessageText(providerPayloads[3].messages.at(-1)).includes("[current_user]\nthird"));
  assert.equal(countOccurrences(providerPayloads[3].messages[0].content, "[system_core]"), 1);
  assert.ok(!providerPayloads[3].messages.some((message, index) => index > 0 && message.content.includes("[system_core]")));
  assert.ok(providerPayloads[4].messages[0].content.includes("[system_core]"));
  assert.ok(providerPayloads[4].messages.some((message) => providerMessageText(message).includes("[current_user]\nthird")));
  assert.ok(providerPayloads[4].messages.some((message) => message.role === "tool" && providerMessageText(message).includes("tool only body")));
  assert.equal(providerPayloads[4].messages.filter((message) => providerMessageText(message).includes("mem_late_thinking")).length, 1);
  assert.ok(providerMessageText(providerPayloads[4].messages.at(-1)).includes("mem_late_thinking"));
  assert.equal(recallCalls, 3);
  const sidecar = loadPiSessionSidecar({ projectMarchDir, sessionRef: "turn-flow.jsonl" });
  assert.equal(sidecar.state.sessionName, "Manual Name");
  assert.equal(sidecar.state.turns[0].assistantMessage, "draft text");
  assert.equal(sidecar.state.turns[0].assistantContext, "12345678\n→ read · a.txt\ndraft text");
  assert.ok(!("summary" in sidecar.state.turns[0]));
  assert.deepEqual(sessionNameCalls, ["hello", "Manual Name"]);
  assert.ok(calls.some((call) => call[0] === "toolStart" && call[1] === "read"));
  assert.deepEqual(calls.at(-1), ["turnEnd"]);
  await assertContextHookRecallsFromMessageUpdateOnly();

  if (previousKey === undefined) {
    delete process.env.DEEPSEEK_API_KEY;
  } else {
    process.env.DEEPSEEK_API_KEY = previousKey;
  }
  currentPiExtensions = [];
  cleanup(dir);
  console.log("  PASS");
}

async function assertContextHookRecallsFromMessageUpdateOnly() {
  const { createMarchPiContextExtension } = await import("../src/agent/runner/context/pi-context-extension.mjs");
  const handlers = new Map();
  let recalledText = "";
  let buffer = "";
  const extension = createMarchPiContextExtension({
    engine: { buildProviderContext: () => ({ system: "system" }) },
    sessionBinding: { get: () => ({}) },
    getCurrentPrompt: () => "prompt",
    getContextMode: () => "rebuild",
    getFastEntry: () => null,
    observeAssistantMessageEvent: (event) => {
      if (event.type === "thinking_delta" || event.type === "text_delta") buffer += event.delta;
      if (event.type === "thinking_end" && event.content) buffer += event.content;
    },
    flushAssistantRecall: async () => {
      const text = buffer;
      buffer = "";
      recalledText = text;
      return { hints: [{ id: "mem_from_messages", name: "From messages", description: "Read directly from context messages." }], report: null };
    },
  });
  await extension({
    on(type, handler) {
      handlers.set(type, handler);
    },
  });
  const context = handlers.get("context");
  const messageUpdate = handlers.get("message_update");
  messageUpdate({ type: "message_update", assistantMessageEvent: { type: "thinking_delta", delta: "message thinking" }, message: { role: "assistant", content: [] } });
  const result = await context({
    type: "context",
    messages: [
      { role: "user", content: "first call" },
      { role: "assistant", content: [{ type: "thinking", thinking: "message thinking" }, { type: "toolCall", id: "call_x", name: "read", arguments: {} }] },
      { role: "toolResult", content: "tool result", toolCallId: "call_x" },
    ],
  });
  assert.equal(recalledText, "message thinking");
  assert.equal(result.messages.at(-1).customType, "march.recall");
  assert.ok(result.messages.at(-1).content.includes("mem_from_messages"));
}

function countOccurrences(text, needle) {
  return String(text).split(needle).length - 1;
}

function countUserMessagesContaining(messages, text) {
  return messages.filter((message) => message.role === "user" && providerMessageText(message).includes(text)).length;
}

function providerMessageText(message) {
  if (typeof message?.content === "string") return message.content;
  if (Array.isArray(message?.content)) {
    return message.content.map((part) => part?.text ?? "").join("");
  }
  return "";
}

async function buildProviderPayload(session, prompt, operationalMessages = []) {
  let systemPrompt = "Pi system";
  for (const handler of extensionHandlers("before_agent_start")) {
    const result = await handler({ type: "before_agent_start", prompt, images: undefined, systemPrompt, systemPromptOptions: {} }, { model: session.model });
    if (result?.systemPrompt) systemPrompt = result.systemPrompt;
  }
  let messages = [
    ...session.agent.state.messages,
    { role: "user", content: [{ type: "text", text: prompt }] },
    ...operationalMessages,
  ];
  for (const handler of extensionHandlers("context")) {
    const result = await handler({ type: "context", messages }, { model: session.model });
    if (result?.messages) messages = result.messages;
  }
  let payload = { messages: [{ role: "system", content: systemPrompt }, ...messages.map(toProviderMessage)] };
  for (const handler of extensionHandlers("before_provider_request")) {
    const result = await handler({ type: "before_provider_request", payload }, { model: session.model });
    if (result !== undefined) payload = result;
  }
  return await session.agent.onPayload(payload, session.model);
}

function extensionHandlers(kind) {
  return currentPiExtensions.flatMap((extension) => extension.handlers.get(kind) ?? []);
}

function toProviderMessage(message) {
  if (message.role === "custom") return { role: "user", content: message.content };
  if (message.role === "toolResult") return { role: "tool", content: message.content, tool_call_id: message.toolCallId };
  return message;
}
