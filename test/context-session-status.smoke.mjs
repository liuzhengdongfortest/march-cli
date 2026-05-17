import { strict as assert } from "node:assert";

export async function runContextSessionStatusSmoke() {
  console.log("--- smoke: context session status ---");
  const { buildSessionIdentity } = await import("../src/context/session-status.mjs");

  const identity = buildSessionIdentity({
    cwd: "/home/me/repo",
    workspaceRoot: "/home/me/repo",
    memoryRoot: "/home/me/.march/March Memories",
    platform: "linux",
  });
  assert.ok(identity.includes("[session_identity]"));
  assert.ok(identity.includes("cwd: /home/me/repo"));
  assert.ok(identity.includes("workspace_root: /home/me/repo"));
  assert.ok(identity.includes("memory_root: /home/me/.march/March Memories"));
  assert.ok(!identity.includes("memory_project"));
  assert.ok(identity.includes("shell: bash"));

  assert.ok(!identity.includes("[workspace_status]"));
  assert.ok(!identity.includes("Directory tree"));
  assert.ok(!identity.includes("[session_status]"));
  console.log("  PASS");
}
