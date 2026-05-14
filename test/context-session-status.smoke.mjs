import { strict as assert } from "node:assert";

function dirent(name, directory = false) {
  return {
    name,
    isDirectory: () => directory,
  };
}

export async function runContextSessionStatusSmoke() {
  console.log("--- smoke: context session status ---");
  const { buildDirTree, buildSessionIdentity, buildWorkspaceStatus } = await import("../src/context/session-status.mjs");
  const entries = new Map([
    ["/repo", [
      dirent(".git", true),
      dirent(".march", true),
      dirent(".hidden", false),
      dirent("node_modules", true),
      dirent("src", true),
      dirent("README.md"),
    ]],
    [`/repo${pathSep()}src`, [dirent("index.mjs")]],
    [`/repo${pathSep()}.march`, [dirent("config")]],
  ]);
  const readdir = (dir) => entries.get(dir) ?? [];

  const tree = buildDirTree({ cwd: "/repo", maxDepth: 2, readdir });
  assert.ok(tree.includes(".march/"));
  assert.ok(tree.includes("src/"));
  assert.ok(tree.includes("README.md"));
  assert.ok(tree.includes("index.mjs"));
  assert.ok(!tree.includes(".git"));
  assert.ok(!tree.includes(".hidden"));
  assert.ok(!tree.includes("node_modules"));

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
  assert.ok(status.includes("Directory tree (top 1 levels):"));
  assert.ok(!status.includes("[session_status]"));
  console.log("  PASS");
}

function pathSep() {
  return process.platform === "win32" ? "\\" : "/";
}
