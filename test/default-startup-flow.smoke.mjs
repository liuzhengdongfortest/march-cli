import { strict as assert } from "node:assert";
import { join } from "node:path";

export async function runDefaultStartupFlowSmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: default pi startup flow candidate ---");
  const { createRunner } = await import("../src/agent/runner.mjs");
  const { resumePiSessionById } = await import("../src/cli/session/pi-session-switch-command.mjs");
  const { loadPiSessionSidecar } = await import("../src/session/sidecar.mjs");

  const dir = setupTmp();
  const projectMarchDir = join(dir, ".march");
  const previousKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = previousKey || "test-key";

  function makeUi(calls) {
    return {
      turnStart: () => calls.push(["turnStart"]),
      turnEnd: () => calls.push(["turnEnd"]),
      textDelta: (text) => calls.push(["text", text]),
      thinkingStart: () => calls.push(["thinkingStart"]),
      thinkingDelta: (text) => calls.push(["thinking", text]),
      thinkingEnd: (tokens) => calls.push(["thinkingEnd", tokens]),
      toolStart: (name) => calls.push(["toolStart", name]),
      toolEnd: (name) => calls.push(["toolEnd", name]),
      summaryStart: () => calls.push(["summaryStart"]),
      summaryDone: () => calls.push(["summaryDone"]),
      editDiff: () => {},
    };
  }

  function makeSession(id, sessionFile) {
    let subscriber = null;
    return {
      id,
      model: { id: "deepseek-v4-pro", provider: "deepseek" },
      thinkingLevel: "medium",
      sessionManager: {
        isPersisted: () => true,
        getSessionFile: () => sessionFile,
      },
      subscribe(callback) {
        subscriber = callback;
        return () => {
          subscriber = null;
        };
      },
      async prompt(prompt) {
        const delta = prompt.includes("Summarize the work") ? `summary ${id}` : `answer ${id}`;
        subscriber?.({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta } });
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
        sessionId: id,
        userMessages: 1,
        assistantMessages: 1,
        toolCalls: 0,
        totalMessages: 2,
        tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        cost: 0,
      }),
      dispose: () => {},
    };
  }

  async function createCandidateRunner({ initialId, initialFile, calls }) {
    const sessionManager = {
      isPersisted: () => true,
      getSessionFile: () => initialFile,
    };
    return createRunner({
      cwd: dir,
      modelId: "deepseek-v4-pro",
      provider: "deepseek",
      stateRoot: join(dir, ".state"),
      ui: makeUi(calls),
      skills: [],
      pins: [],
      projectMarchDir,
      sessionManager,
      useRuntimeHost: true,
      syncPiSidecar: true,
      createRuntimeServices: async (options) => options,
      createRuntimeSessionFromServices: async () => ({ session: makeSession(initialId, initialFile) }),
      createAgentSessionRuntimeImpl: async (createRuntime, options) => {
        const result = await createRuntime({
          cwd: options.cwd,
          sessionManager: options.sessionManager,
          sessionStartEvent: { type: "session_start" },
        });
        let rebindSession = null;
        return {
          session: result.session,
          setRebindSession(callback) {
            rebindSession = callback;
          },
          async switchSession(sessionPath) {
            const id = sessionPath.replace(/\.jsonl$/, "");
            this.session = makeSession(id, sessionPath);
            await rebindSession(this.session);
            return { cancelled: false };
          },
          async dispose() {},
        };
      },
    });
  }

  const firstCalls = [];
  const first = await createCandidateRunner({
    initialId: "default-a",
    initialFile: "default-a.jsonl",
    calls: firstCalls,
  });
  await first.runTurn("hello", "hello");
  first.dispose();

  const savedSidecar = loadPiSessionSidecar({ projectMarchDir, sessionRef: "default-a.jsonl" });
  assert.equal(savedSidecar.state.sessionId, "default-a");
  assert.equal(savedSidecar.state.turns[0].summary, "summary default-a");

  const secondCalls = [];
  const second = await createCandidateRunner({
    initialId: "fresh-start",
    initialFile: "fresh-start.jsonl",
    calls: secondCalls,
  });
  const resumeLines = await resumePiSessionById("default-a", {
    runner: second,
    sessions: [{ id: "default-a", path: "default-a.jsonl" }],
    projectMarchDir,
  });
  assert.deepEqual(resumeLines, ["Resumed pi session: default-a"]);
  assert.equal(second.engine.turns[0].summary, "summary default-a");

  await second.runTurn("next", "next");
  const resumedSidecar = loadPiSessionSidecar({ projectMarchDir, sessionRef: "default-a.jsonl" });
  assert.equal(resumedSidecar.state.sessionId, "default-a");
  assert.equal(resumedSidecar.state.turns.length, 2);
  assert.equal(resumedSidecar.state.turns[1].summary, "summary default-a");
  assert.ok(secondCalls.some((call) => call[0] === "turnStart"));
  second.dispose();

  if (previousKey === undefined) {
    delete process.env.DEEPSEEK_API_KEY;
  } else {
    process.env.DEEPSEEK_API_KEY = previousKey;
  }
  cleanup(dir);
  console.log("  PASS");
}
