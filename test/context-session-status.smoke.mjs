import { strict as assert } from "node:assert";

export async function runContextSessionStatusSmoke() {
  console.log("--- smoke: context session status ---");
  const { buildSessionIdentity, buildWorkspaceStatus } = await import("../src/context/session-status.mjs");

  const identity = buildSessionIdentity({
    cwd: "/home/me/repo",
    workspaceRoot: "/home/me/repo",
    platform: "linux",
  });
  assert.ok(identity.includes("[session_identity]"));
  assert.ok(identity.includes("cwd: /home/me/repo"));
  assert.ok(identity.includes("workspace_root: /home/me/repo"));
  assert.ok(identity.includes("shell: bash"));

  const status = buildWorkspaceStatus({
    cwd: "/home/me/repo",
    home: "/home/me",
    readdir: () => [],
  });
  assert.ok(status.includes("[workspace_status]"));
  assert.ok(status.includes("project: ~/repo"));
  assert.ok(!status.includes("Directory tree"));
  assert.ok(!status.includes("[session_status]"));
  console.log("  PASS");
}
