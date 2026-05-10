import { strict as assert } from "node:assert";

export async function runShellCommandSmoke() {
  console.log("--- smoke: shell command ---");
  const { handleShellCommand, parseShellCommand } = await import("../src/cli/shell-command.mjs");

  assert.deepEqual(parseShellCommand("hello"), { type: "none" });
  assert.deepEqual(parseShellCommand("/shell"), { type: "list" });
  assert.deepEqual(parseShellCommand("/shell spawn"), { type: "spawn", name: "" });
  assert.deepEqual(parseShellCommand("/shell spawn dev"), { type: "spawn", name: "dev" });
  assert.deepEqual(parseShellCommand("/shell dev"), { type: "show", idOrName: "dev" });
  assert.deepEqual(handleShellCommand({ type: "list" }, {}), ["Shell runtime is not enabled."]);

  const shell = {
    id: "sh1",
    name: "dev",
    status: "running",
    command: "powershell.exe",
    args: ["-NoLogo"],
    lineCount: 2,
  };
  const shellRuntime = {
    listShells: () => [shell],
    snapshotShell: (id) => ({ plain: `output for ${id}`, ansi: "\x1b[32moutput\x1b[0m" }),
    spawnShell: ({ name }) => ({ ...shell, id: "sh2", name: name || "powershell.exe", lineCount: 0 }),
  };
  assert.deepEqual(handleShellCommand({ type: "spawn", name: "dev2" }, { shellRuntime }), [
    "Spawned shell: sh2  dev2  running",
    "Open the drawer with Alt+S, then type directly to send input.",
  ]);
  assert.deepEqual(handleShellCommand({ type: "list" }, { shellRuntime }), [
    "Shells:",
    "sh1  dev  running  powershell.exe -NoLogo  2 lines",
    "Use /shell <id-or-name> to inspect recent output, or /shell spawn [name] to start one.",
  ]);
  assert.deepEqual(handleShellCommand({ type: "show", idOrName: "dev" }, { shellRuntime }), [
    "sh1  dev  running  powershell.exe -NoLogo  2 lines",
    "Recent output:",
    "output for sh1",
  ]);
  assert.deepEqual(handleShellCommand({ type: "show", idOrName: "missing" }, { shellRuntime }), [
    "Error: shell not found: missing",
  ]);

  console.log("  PASS");
}
