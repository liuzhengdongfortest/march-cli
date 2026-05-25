import { strict as assert } from "node:assert";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

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
  const customSteerMessages = [];
  const session = {
    agent: {
      state: { messages: [{ role: "user", content: "stale context" }] },
      onPayload: async (payload) => payload,
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
      providerPayloads.push(await this.agent.onPayload({
        messages: isContinuation
          ? [
              ...this.agent.state.messages,
              { role: "user", content: [{ type: "text", text: prompt }] },
            ]
          : [
              { role: "system", content: "Pi system" },
              { role: "user", content: [{ type: "text", text: prompt }] },
            ],
      }, this.model));
      if (promptCalls.length === 1) {
        emit({ type: "message_update", assistantMessageEvent: { type: "thinking_start" } });
        emit({ type: "message_update", assistantMessageEvent: { type: "thinking_delta", delta: "12345678" } });
        emit({ type: "message_update", assistantMessageEvent: { type: "thinking_end" } });
        emit({ type: "tool_execution_start", toolName: "read", args: { path: "a.txt" } });
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(recallCalls, 1);
        assert.equal(customSteerMessages.length, 1);
        assert.ok(customSteerMessages[0].includes("[recall]"));
        emit({ type: "tool_execution_end", toolName: "read", isError: false, result: "file body" });
        providerPayloads.push(await this.agent.onPayload({
          messages: [
            { role: "system", content: "Pi system" },
            { role: "assistant", content: null, tool_calls: [{ id: "call_1", type: "function", function: { name: "read", arguments: '{"path":"a.txt"}' } }] },
            { role: "tool", content: "file body", tool_call_id: "call_1" },
          ],
        }, this.model));
        emit({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "draft text" } });
      } else if (promptCalls.length === 3) {
        emit({ type: "tool_execution_start", toolName: "read", args: { path: "tool-only.txt" } });
        emit({ type: "message_update", assistantMessageEvent: { type: "thinking_start" } });
        emit({ type: "message_update", assistantMessageEvent: { type: "thinking_end", content: "late thinking memory text" } });
        emit({ type: "tool_execution_end", toolName: "read", isError: false, result: "tool only body" });
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(customSteerMessages.length, 2);
        providerPayloads.push(await this.agent.onPayload({
          messages: [
            { role: "system", content: "Pi system" },
            { role: "assistant", content: null, tool_calls: [{ id: "call_2", type: "function", function: { name: "read", arguments: '{"path":"tool-only.txt"}' } }] },
            { role: "tool", content: "tool only body", tool_call_id: "call_2" },
          ],
        }, this.model));
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
    sendCustomMessage(message, options) {
      assert.equal(message.customType, "march.recall");
      assert.equal(message.display, false);
      assert.equal(options.deliverAs, "steer");
      customSteerMessages.push(message.content);
      return Promise.resolve();
    },
    dispose: () => {},
  };
  function emit(event) {
    subscriber?.(event);
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
      return { session };
    },
  });

  const result = await runner.runTurn("hello", "hello");
  assert.equal(result.draft, "draft text");
  assert.equal(promptCalls.length, 1);
  assert.equal(providerPayloads.length, 2);
  assert.ok(!promptCalls[0].includes("[system_core]"));
  assert.equal(providerPayloads[0].messages[0].role, "system");
  assert.ok(providerPayloads[0].messages[0].content.includes("[system_core]"));
  assert.ok(!providerPayloads[0].messages[0].content.includes("[workspace_status]"));
  assert.ok(!providerPayloads[0].messages[0].content.includes("[recent_chat]"));
  assert.equal(providerPayloads[0].messages[1].role, "user");
  assert.ok(!providerPayloads[0].messages.some((message) => message.role === "user" && message.content.includes("[workspace_status]")));
  assert.ok(providerPayloads[0].messages.some((message) => message.role === "user" && message.content.includes("[session_identity]")));
  assert.ok(providerPayloads[0].messages.some((message) => message.role === "user" && message.content.includes(`memory_root: ${join(projectMarchDir, "memories")}`)));
  assert.ok(!providerPayloads[0].messages.some((message) => message.role === "user" && message.content.includes("[runtime_status]")));
  assert.ok(!providerPayloads[0].messages.some((message, index) => index > 0 && message.content.includes("[system_core]")));
  assert.ok(!providerPayloads[0].messages.some((message, index) => index > 0 && message.role === "system"));
  assert.ok(providerPayloads[0].messages.at(-1).content.includes("[recent_chat]"));
  assert.ok(providerPayloads[0].messages.at(-1).content.includes("[current_user]\nhello"));
  assert.equal(countUserMessagesContaining(providerPayloads[0].messages, "hello"), 1);
  assert.equal(providerPayloads[1].messages[0].role, "system");
  assert.equal(providerPayloads[1].messages[0].content, "Pi system");
  assert.ok(!providerPayloads[1].messages.some((message) => providerMessageText(message).includes("[system_core]")));
  assert.equal(providerPayloads[1].messages.filter((message) => providerMessageText(message).includes("[recall]")).length, 1);
  assert.ok(customSteerMessages[0].includes("mem_thinking | Thinking memory | Matched from thinking text."));
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
  assert.equal(providerPayloads[2].messages[0].role, "user");
  assert.equal(providerPayloads[2].messages[0].content, "aborted question");
  assert.equal(providerPayloads[2].messages[1].stopReason, "aborted");
  assert.equal(providerPayloads[2].messages.at(-1).role, "user");
  assert.equal(providerMessageText(providerPayloads[2].messages.at(-1)), "second");
  assert.ok(!providerPayloads[2].messages.some((message) => providerMessageText(message).includes("[system_core]")));
  assert.ok(!providerPayloads[2].messages.some((message) => providerMessageText(message).includes("[workspace_status]")));
  assert.ok(!providerPayloads[2].messages.some((message) => providerMessageText(message).includes("[recent_chat]")));

  await runner.runTurn("third", "third");
  assert.equal(promptCalls.length, 3);
  assert.ok(!promptCalls[2].includes("[system_core]"));
  assert.ok(providerPayloads[3].messages[0].content.includes("[system_core]"));
  assert.ok(!providerPayloads[3].messages[0].content.includes("[recent_chat]"));
  assert.ok(providerPayloads[3].messages.at(-1).content.includes("[recent_chat]"));
  assert.ok(providerPayloads[3].messages.at(-1).content.includes("draft text"));
  assert.ok(providerPayloads[3].messages.at(-1).content.includes("→ read · a.txt"));
  assert.ok(!providerPayloads[3].messages.at(-1).content.includes("file body"));
  assert.ok(providerPayloads[3].messages.at(-1).content.includes("[current_user]\nthird"));
  assert.equal(countOccurrences(providerPayloads[3].messages[0].content, "[system_core]"), 1);
  assert.ok(!providerPayloads[3].messages.some((message, index) => index > 0 && message.content.includes("[system_core]")));
  assert.equal(providerPayloads[4].messages[0].content, "Pi system");
  assert.ok(!providerPayloads[4].messages.some((message) => providerMessageText(message).includes("[system_core]")));
  assert.equal(providerPayloads[4].messages.filter((message) => providerMessageText(message).includes("[recall]")).length, 1);
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

  if (previousKey === undefined) {
    delete process.env.DEEPSEEK_API_KEY;
  } else {
    process.env.DEEPSEEK_API_KEY = previousKey;
  }
  cleanup(dir);
  console.log("  PASS");
}

function countOccurrences(text, needle) {
  return String(text).split(needle).length - 1;
}

function countUserMessagesContaining(messages, text) {
  return messages.filter((message) => message.role === "user" && String(message.content).includes(text)).length;
}

function providerMessageText(message) {
  if (typeof message?.content === "string") return message.content;
  if (Array.isArray(message?.content)) {
    return message.content.map((part) => part?.text ?? "").join("");
  }
  return "";
}
