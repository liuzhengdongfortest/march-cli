import { strict as assert } from "node:assert";

export async function runShellToolsSmoke() {
  console.log("--- smoke: shell tools ---");
  const { createShellRuntime } = await import("../src/shell/runtime.mjs");
  const { createShellTools } = await import("../src/shell/tools.mjs");

  let nextId = 1;
  const runtime = createShellRuntime({
    idFactory: () => `sh${nextId++}`,
    createPty: ({ onData, onExit }) => ({
      write: (text) => onData(`seen:${text}\n`),
      kill: () => onExit({ signal: "SIGTERM" }),
    }),
  });
  const tools = createShellTools(runtime);
  const byName = Object.fromEntries(tools.map((tool) => [tool.name, tool]));

  assert.deepEqual(createShellTools(null), []);
  assert.ok(byName.shell_spawn);
  assert.ok(byName.shell_send);
  assert.ok(byName.shell_list);
  assert.ok(byName.shell_kill);
  assert.ok(byName.shell_search);
  assert.ok(byName.shell_snapshot);

  const spawned = await byName.shell_spawn.execute("tc1", {
    name: "dev",
    command: "powershell.exe",
    args: ["-NoLogo"],
    cwd: "D:/repo",
  });
  assert.ok(spawned.content[0].text.includes("sh1"));
  assert.equal(spawned.details.shell.status, "running");

  const sent = await byName.shell_send.execute("tc2", { shell_id: "sh1", text: "hello" });
  assert.ok(sent.content[0].text.includes("Sent 5 chars"));
  assert.equal(runtime.snapshotShell("sh1").plain, "seen:hello");

  const search = await byName.shell_search.execute("tc-search", { shell_id: "sh1", pattern: "hello" });
  assert.ok(search.content[0].text.includes("seen:hello"));
  assert.equal(search.details.matches.length, 1);

  const snapshot = await byName.shell_snapshot.execute("tc-snapshot", { shell_id: "sh1" });
  assert.equal(snapshot.content[0].text, "seen:hello");
  assert.equal(snapshot.details.plain, "seen:hello");

  const listed = await byName.shell_list.execute("tc3", {});
  assert.ok(listed.content[0].text.includes("dev"));
  assert.equal(listed.details.shells.length, 1);

  const killed = await byName.shell_kill.execute("tc4", { shell_id: "sh1" });
  assert.ok(killed.content[0].text.includes("Killed dev"));
  assert.equal(killed.details.shell.status, "killed");

  const late = await byName.shell_send.execute("tc5", { shell_id: "sh1", text: "late" });
  assert.equal(late.details.error, true);
  assert.ok(late.content[0].text.includes("is killed"));

  console.log("  PASS");
}
