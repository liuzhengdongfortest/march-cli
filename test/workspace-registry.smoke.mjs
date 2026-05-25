import { strict as assert } from "node:assert";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

export async function runWorkspaceRegistrySmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: workspace project registry and switcher model ---");
  const { registerProject, listRegisteredProjects } = await import("../src/workspace/project-registry.mjs");
  const { buildWorkspaceSessionSelectItems, listWorkspaceSessions, workspaceSessionSearchText } = await import("../src/workspace/session-index.mjs");
  const { handleProjectCommand, parseProjectCommand } = await import("../src/cli/workspace/command.mjs");

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
  } finally {
    cleanup(stateRoot);
    cleanup(rootA);
    cleanup(rootB);
  }
  console.log("  PASS");
}
