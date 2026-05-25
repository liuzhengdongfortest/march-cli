import { strict as assert } from "node:assert";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

export async function runWorkspaceRegistrySmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: workspace project registry and switcher model ---");
  const { registerProject, listRegisteredProjects } = await import("../src/workspace/project-registry.mjs");
  const { buildWorkspaceSessionSelectItems, listWorkspaceSessions, workspaceSessionSearchText } = await import("../src/workspace/session-index.mjs");
  const { handleProjectCommand, parseProjectCommand } = await import("../src/cli/workspace/command.mjs");
  const { createWorkspaceSessionSupervisor } = await import("../src/workspace/supervisor.mjs");
  const { createWorkspaceOutputRouter } = await import("../src/cli/workspace/output-router.mjs");
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

    const lines = await handleProjectCommand({ type: "add", path: rootB }, { stateRoot });
    assert.ok(lines.join("\n").includes("Registered project"));

    const rendered = [];
    const baseUi = { textDelta: (text) => rendered.push(text), writeln: (text) => rendered.push(text), requestPermission: async () => true };
    const outputRouter = createWorkspaceOutputRouter({ ui: baseUi, activeProjectId: projectA.projectId });
    const uiA = outputRouter.createProjectUi(projectA.projectId);
    const uiB = outputRouter.createProjectUi(projectB.projectId);
    uiA.textDelta("visible-a");
    uiB.textDelta("hidden-b");
    assert.deepEqual(rendered, ["visible-a"]);
    assert.equal(outputRouter.getBufferedCalls(projectB.projectId)[0].method, "textDelta");
    assert.equal(outputRouter.getBufferedCallCount(projectB.projectId), 1);
    assert.equal(await uiB.requestPermission({ toolName: "edit" }), false);
    outputRouter.setActiveProject(projectB.projectId);
    assert.equal(outputRouter.replayBufferedCalls(projectB.projectId), 2);
    uiB.textDelta("visible-b");
    assert.deepEqual(rendered, ["visible-a", "hidden-b", "visible-b"]);

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
    savePiSessionSidecarState({ projectMarchDir: join(rootB, ".march"), sessionRef: targetSession.path, state: { version: 1, cwd: resolve(rootB), turns: [] } });
    assert.equal(supervisor.runner.engine.cwd, resolve(rootA));
    assert.equal(supervisor.hasRunningTurn(), false);
    supervisor.getActive().turnTask = Promise.resolve();
    assert.equal(supervisor.hasRunningTurn(), true);
    supervisor.getActive().turnTask = null;
    await supervisor.activateWorkspaceSession({ project: projectB, session: targetSession });
    assert.equal(supervisor.runner.engine.cwd, resolve(rootB));
    assert.deepEqual(activated, [projectB.projectId]);
    assert.equal(viewSessionState.sessionId, "s-b");
    const summaries = supervisor.getRuntimeSummaries();
    assert.ok(summaries.some((runtime) => runtime.projectId === projectB.projectId && runtime.sessionId === "s-b"));
    await supervisor.startNewWorkspaceSession(projectB);
    assert.equal(viewSessionState.sessionId, "created-1");
    await supervisor.dispose();
    assert.deepEqual(disposed.sort(), [projectA.projectId, projectB.projectId].sort());
  } finally {
    cleanup(stateRoot);
    cleanup(rootA);
    cleanup(rootB);
  }
  console.log("  PASS");
}

function mockRuntime({ project, cwd, sessionId, disposed, startNewSession = async () => ({ sessionId: "created" }) }) {
  return {
    project,
    cwd: resolve(cwd),
    currentProject: project.displayName,
    sessionState: { sessionId, sessionDir: join(resolve(cwd), ".march", "sessions", sessionId) },
    sessionsRoot: join(resolve(cwd), ".march", "sessions"),
    projectMarchDir: join(resolve(cwd), ".march"),
    runner: {
      engine: { cwd: resolve(cwd) },
      runtimeState: { engine: { cwd: resolve(cwd) } },
      async switchPiSession(path) {
        this.sessionPath = path;
      },
      startNewSession,
      async dispose() {
        disposed.push(project.projectId);
      },
    },
  };
}
