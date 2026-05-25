import { strict as assert } from "node:assert";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

export async function runWorkspaceRegistrySmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: workspace project registry and session selector model ---");
  const { registerProject, listRegisteredProjects } = await import("../src/workspace/project-registry.mjs");
  const { buildWorkspaceSessionSelectItems, listWorkspaceSessions, workspaceSessionSearchText } = await import("../src/workspace/session-index.mjs");
  const { WORKSPACE_SLASH_COMMANDS, handleProjectCommand, parseProjectCommand } = await import("../src/cli/workspace/command.mjs");
  const { createWorkspaceSessionSupervisor } = await import("../src/workspace/supervisor.mjs");
  const { createWorkspaceOutputRouter } = await import("../src/cli/workspace/output-router.mjs");
  const { createTuiTimelineInstance } = await import("../src/cli/workspace/tui-timeline.mjs");
  const { savePiSessionSidecarState } = await import("../src/session/sidecar.mjs");

  const stateRoot = setupTmp();
  const rootA = setupTmp();
  const rootB = setupTmp();
  try {
    mkdirSync(join(rootA, ".march"), { recursive: true });
    mkdirSync(join(rootB, ".march"), { recursive: true });

    const projectA = registerProject({ stateRoot, rootPath: rootA, now: new Date("2026-05-20T00:00:00.000Z") });
    const projectB = registerProject({ stateRoot, rootPath: rootB, now: new Date("2026-05-21T00:00:00.000Z") });
    registerProject({ stateRoot, rootPath: rootA, now: new Date("2026-05-22T00:00:00.000Z") });

    const registered = listRegisteredProjects({ stateRoot });
    assert.equal(registered.length, 2);
    assert.equal(registered[0].projectId, projectA.projectId);
    assert.equal(registered[0].rootPath, resolve(rootA));

    const workspace = await listWorkspaceSessions({
      stateRoot,
      currentProjectId: projectA.projectId,
      listSessions: async ({ cwd }) => cwd === resolve(rootA)
        ? [{ id: "s-a", name: "Fix A", savedAt: "2026-05-23T01:02:03.000Z", firstMessage: "hello A" }]
        : [],
    });
    assert.equal(workspace.length, 2);
    assert.equal(workspace.find((project) => project.projectId === projectA.projectId).current, true);
    assert.equal(workspace.find((project) => project.projectId === projectB.projectId).sessionCount, 0);

    const items = buildWorkspaceSessionSelectItems(workspace, "s-a");
    assert.equal(items[0].session.id, "s-a");
    assert.ok(items[0].description.includes("current"));
    assert.ok(items.some((item) => item.kind === "new-session" && item.project.projectId === projectB.projectId));
    assert.ok(workspaceSessionSearchText(items[0]).includes("Fix A"));

    assert.deepEqual(parseProjectCommand("/project"), { type: "list" });
    assert.deepEqual(parseProjectCommand("/project add C:/repo/demo"), { type: "add", path: "C:/repo/demo" });
    assert.deepEqual(parseProjectCommand("/project remove x"), { type: "none" });
    assert.equal(WORKSPACE_SLASH_COMMANDS.some((command) => command.match("/session")), true);
    assert.equal(WORKSPACE_SLASH_COMMANDS.some((command) => command.match("/switch")), false);

    const lines = await handleProjectCommand({ type: "add", path: rootB }, { stateRoot });
    assert.ok(lines.join("\n").includes("Registered project"));

    const rendered = [];
    const baseUi = { clearOutput: () => { rendered.length = 0; }, textDelta: (text) => rendered.push(text), writeln: (text) => rendered.push(text), assistantReplyEnd: () => {} };
    const persistedRenderChanges = [];
    const outputRouter = createWorkspaceOutputRouter({ ui: baseUi, activeProjectId: projectA.projectId, activeSessionId: "s-a", onRenderTimelineChange: (change) => persistedRenderChanges.push(change) });
    const uiA = outputRouter.createProjectUi(projectA.projectId, () => "s-a");
    const uiB = outputRouter.createProjectUi(projectB.projectId, () => "s-b");
    const uiB2 = outputRouter.createProjectUi(projectB.projectId, () => "s-b2");
    uiA.textDelta("visible-a");
    uiB.textDelta("hidden-b");
    uiB2.textDelta("hidden-b2");
    assert.deepEqual(rendered, ["visible-a"]);
    assert.equal(outputRouter.getRenderEvents(projectB.projectId, "s-b")[0].method, "textDelta");
    assert.equal(outputRouter.getRenderEventCount(projectA.projectId, "s-a"), 1);
    assert.equal(outputRouter.getRenderEventCount(projectB.projectId, "s-b"), 1);
    assert.equal(outputRouter.getRenderEventCount(projectB.projectId, "s-b2"), 1);

    assert.equal(outputRouter.setActiveSession(projectB.projectId, "s-b"), 1);
    assert.deepEqual(rendered, ["hidden-b"]);
    uiB.textDelta("visible-b");
    assert.deepEqual(rendered, ["hidden-b", "visible-b"]);
    assert.equal(outputRouter.setActiveSession(projectA.projectId, "s-a"), 1);
    assert.deepEqual(rendered, ["visible-a"]);
    // A cold disk hydrate must not overwrite a hot in-process timeline for a background session.
    assert.equal(outputRouter.setActiveSession(projectB.projectId, "s-b", { renderTimeline: [{ method: "textDelta", args: ["stale-disk-b"] }] }), 2);
    assert.deepEqual(rendered, ["hidden-b", "visible-b"]);

    const restoredBlocks = [];
    const blockRouter = createWorkspaceOutputRouter({
      ui: {
        restoreTimelineBlocks: (blocks) => restoredBlocks.push(blocks),
        clearOutput: () => { throw new Error("block restore should not replay raw events"); },
        textDelta: () => { throw new Error("block restore should not call textDelta"); },
      },
      activeProjectId: projectA.projectId,
      activeSessionId: "blocks-a",
    });
    const blockUi = blockRouter.createProjectUi(projectA.projectId, () => "blocks-b");
    blockUi.textDelta("block stream");
    assert.equal(blockRouter.setActiveSession(projectA.projectId, "blocks-b"), 1);
    assert.equal(restoredBlocks.at(-1)[0].type, "assistant");
    assert.equal(restoredBlocks.at(-1)[0].content, "block stream");

    uiA.clearOutput();
    assert.equal(outputRouter.getRenderEventCount(projectA.projectId, "s-a"), 0);
    assert.deepEqual(persistedRenderChanges.at(-1).events, []);

    const boundedTimeline = createTuiTimelineInstance({ key: "bounded", maxEvents: 2 });
    boundedTimeline.apply("textDelta", ["one"], { at: 1 });
    boundedTimeline.apply("textDelta", ["two"], { at: 2 });
    boundedTimeline.apply("textDelta", ["three"], { at: 3 });
    assert.deepEqual(boundedTimeline.getEvents().map((event) => event.args[0]), ["two", "three"]);
    assert.deepEqual(boundedTimeline.getBlocks().map((block) => block.content), ["twothree"]);
    assert.equal(boundedTimeline.getMetadata().eventCount, 2);
    assert.equal(boundedTimeline.getMetadata().blockCount, 1);
    assert.equal(boundedTimeline.getMetadata().openAssistant, true);
    assert.ok(boundedTimeline.getMetadata().estimatedBytes > 0);

    const projectedTimeline = createTuiTimelineInstance({ key: "projected" });
    projectedTimeline.apply("textDelta", ["hello "], { at: 1 });
    projectedTimeline.apply("textDelta", ["world"], { at: 2 });
    projectedTimeline.apply("assistantReplyEnd", [], { at: 3 });
    projectedTimeline.apply("toolStart", ["read", { path: "a" }], { at: 4 });
    projectedTimeline.apply("toolEnd", ["read", false, "ok"], { at: 5 });
    assert.deepEqual(projectedTimeline.getBlocks().map((block) => block.type), ["assistant", "tool"]);
    assert.deepEqual(projectedTimeline.getBlocks()[0], { id: "assistant-1", type: "assistant", createdAt: 1, updatedAt: 3, content: "hello world", closed: true });
    assert.equal(projectedTimeline.getBlocks()[1].closed, true);
    assert.equal(projectedTimeline.getBlocks()[1].result, "ok");
    const persistedTimelines = [];
    const persistRouter = createWorkspaceOutputRouter({
      ui: baseUi,
      activeProjectId: projectA.projectId,
      activeSessionId: "persist-a",
      persistDebounceMs: 10,
      onPersistRenderTimeline: (change) => persistedTimelines.push(change),
    });
    const persistUiA = persistRouter.createProjectUi(projectA.projectId, () => "persist-a");
    const persistUiB = persistRouter.createProjectUi(projectA.projectId, () => "persist-b");
    persistUiA.textDelta("debounced-a");
    assert.equal(persistedTimelines.length, 0);
    await delay(20);
    assert.equal(persistedTimelines.length, 1);
    assert.equal(persistedTimelines[0].sessionId, "persist-a");
    assert.equal(persistedTimelines[0].reason, "debounce");
    persistUiA.textDelta("flush-a");
    persistUiA.assistantReplyEnd?.();
    assert.equal(persistedTimelines.at(-1).reason, "assistantReplyEnd");
    persistUiA.textDelta("switch-a");
    persistRouter.setActiveSession(projectA.projectId, "persist-b");
    assert.equal(persistedTimelines.at(-1).reason, "session-switch");
    persistUiB.clearOutput();
    assert.equal(persistedTimelines.at(-1).reason, "clear");
    assert.deepEqual(persistedTimelines.at(-1).events, []);

    const viewSessionState = { sessionId: "s-a", sessionDir: "" };
    const disposed = [];
    const activated = [];
    let newSessionCounter = 0;
    const supervisor = createWorkspaceSessionSupervisor({
      initialRuntime: mockRuntime({ project: projectA, cwd: rootA, sessionId: "s-a", disposed }),
      viewSessionState,
      createProjectRuntime: async (project) => mockRuntime({ project, cwd: project.rootPath, sessionId: "new", disposed, startNewSession: async () => ({ sessionId: `created-${++newSessionCounter}` }) }),
      onActivate: ({ projectId }) => activated.push(projectId),
    });
    const targetSession = { id: "s-b", path: join(rootB, ".march", "pi-sessions", "s-b.json") };
    writePiSessionTranscript(targetSession.path, "hello b", "answer b");
    savePiSessionSidecarState({ projectMarchDir: join(rootB, ".march"), sessionRef: targetSession.path, state: { version: 1, cwd: resolve(rootB), turns: [] } });
    assert.equal(supervisor.runner.engine.cwd, resolve(rootA));
    assert.equal(supervisor.hasRunningTurn(), false);
    supervisor.getActive().turnTask = Promise.resolve();
    assert.equal(supervisor.hasRunningTurn(), true);
    supervisor.getActive().turnTask = null;
    await supervisor.activateWorkspaceSession({ project: projectB, session: targetSession });
    assert.equal(supervisor.runner.engine.cwd, resolve(rootB));
    assert.deepEqual(supervisor.getActive().runner.lastRestoreState.turns, [{ index: 1, userMessage: "hello b", assistantMessage: "answer b" }]);
    assert.deepEqual(activated, [projectB.projectId]);
    assert.equal(viewSessionState.sessionId, "s-b");
    const summaries = supervisor.getRuntimeSummaries();
    assert.ok(summaries.some((runtime) => runtime.projectId === projectB.projectId && runtime.sessionId === "s-b"));
    await supervisor.startNewWorkspaceSession(projectB);
    assert.equal(viewSessionState.sessionId, "created-1");
    const sameProjectOtherSession = { id: "s-b2", path: join(rootB, ".march", "pi-sessions", "s-b2.json") };
    savePiSessionSidecarState({ projectMarchDir: join(rootB, ".march"), sessionRef: sameProjectOtherSession.path, state: { version: 1, cwd: resolve(rootB), turns: [] } });
    supervisor.getActive().turnTask = Promise.resolve();
    await supervisor.activateWorkspaceSession({ project: projectB, session: sameProjectOtherSession });
    assert.equal(viewSessionState.sessionId, "s-b2");
    assert.equal(supervisor.getRunningTurns().length, 1);
    assert.ok(supervisor.getRuntimeSummaries().some((runtime) => runtime.projectId === projectB.projectId && runtime.sessionId === "created-1" && runtime.running));
    supervisor.getRuntimeSummaries().find((runtime) => runtime.sessionId === "created-1");
    await supervisor.dispose();
    assert.equal(disposed.filter((item) => item === projectA.projectId).length, 1);
    assert.equal(disposed.filter((item) => item === projectB.projectId).length, 2);
    assert.equal(disposed.filter((item) => item === `memory:${projectB.projectId}`).length, 2);
  } finally {
    cleanup(stateRoot);
    cleanup(rootA);
    cleanup(rootB);
  }
  console.log("  PASS");
}

function writePiSessionTranscript(path, userMessage, assistantMessage) {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, [
    JSON.stringify({ type: "message", message: { role: "user", content: userMessage } }),
    JSON.stringify({ type: "message", message: { role: "assistant", content: assistantMessage } }),
  ].join("\n"), "utf8");
}

function mockRuntime({ project, cwd, sessionId, disposed, startNewSession = async () => ({ sessionId: "created" }) }) {
  return {
    project,
    cwd: resolve(cwd),
    currentProject: project.displayName,
    sessionState: { sessionId, sessionDir: join(resolve(cwd), ".march", "sessions", sessionId) },
    sessionsRoot: join(resolve(cwd), ".march", "sessions"),
    projectMarchDir: join(resolve(cwd), ".march"),
    memoryStore: { close: () => disposed.push(`memory:${project.projectId}`) },
    runner: mockRunner({ project, cwd, sessionId, disposed, startNewSession }),
  };
}

function mockRunner({ project, cwd, sessionId, disposed, startNewSession }) {
  let activeSessionId = sessionId;
  return {
    engine: { cwd: resolve(cwd) },
    runtimeState: { engine: { cwd: resolve(cwd) } },
    getSessionStats() {
      return { sessionId: activeSessionId };
    },
    async switchPiSession(path, restoreState) {
      this.sessionPath = path;
      this.lastRestoreState = restoreState;
      this.engine.turns = restoreState?.turns ?? [];
      // Backend stats can lag behind the March-selected session; supervisor routing must not depend on it.
    },
    async startNewSession() {
      const result = await startNewSession();
      activeSessionId = result.sessionId;
      return result;
    },
    async dispose() {
      disposed.push(project.projectId);
    },
  };
}