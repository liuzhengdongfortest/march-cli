import { strict as assert } from "node:assert";

export async function runShellToolsSmoke() {
  console.log("--- smoke: shell tools ---");
  const { createShellRuntime } = await import("../src/shell/runtime.mjs");
  const { createShellTools } = await import("../src/shell/tools.mjs");

  let nextId = 1;
  const writes = [];
  const runtime = createShellRuntime({
    idFactory: () => `sh${nextId++}`,
    createPty: ({ onData, onExit }) => ({
      write: (text) => {
        writes.push(text);
        onData(`seen:${text}\n`);
      },
      resize: () => {},
      kill: () => onExit({ signal: "SIGTERM" }),
    }),
  });
  const tools = createShellTools(runtime);
  const byName = Object.fromEntries(tools.map((tool) => [tool.name, tool]));

  assert.deepEqual(createShellTools(null), []);
  assert.ok(byName.terminal_spawn);
  assert.ok(byName.terminal_send);
  assert.ok(byName.terminal_send.parameters.properties.text.description.includes("Newlines"));
  assert.equal(byName.terminal_run, undefined);
  assert.ok(byName.terminal_list);
  assert.ok(byName.terminal_kill);
  assert.ok(byName.terminal_resize);
  assert.ok(byName.terminal_clear);
  assert.ok(byName.terminal_search);
  assert.ok(byName.terminal_snapshot);

  const spawned = await byName.terminal_spawn.execute("tc1", {
    name: "dev",
    command: "powershell.exe",
    args: ["-NoLogo"],
    cwd: "D:/repo",
    cols: 132,
    rows: 35,
  });
  assert.ok(spawned.content[0].text.includes("sh1"));
  assert.equal(spawned.details.shell.status, "running");
  assert.equal(spawned.details.shell.cols, 132);
  assert.equal(spawned.details.shell.rows, 35);

  const reusedSpawn = await byName.terminal_spawn.execute("tc-reuse", { name: "dev" });
  assert.equal(reusedSpawn.details.shell.id, "sh1");

  const sent = await byName.terminal_send.execute("tc2", { shell_id: "sh1", text: "hello" });
  assert.ok(sent.content[0].text.includes("Sent 5 chars"));
  assert.equal(runtime.snapshotShell("sh1").plain, "seen:hello");

  const search = await byName.terminal_search.execute("tc-search", { shell_id: "sh1", pattern: "hello" });
  assert.ok(search.content[0].text.includes("seen:hello"));
  assert.equal(search.details.matches.length, 1);

  const snapshot = await byName.terminal_snapshot.execute("tc-snapshot", { shell_id: "sh1" });
  assert.equal(snapshot.content[0].text, "seen:hello");
  assert.equal(snapshot.details.plain, "seen:hello");
  assert.ok(snapshot.details.screen);

  const sentEnter = await byName.terminal_send.execute("tc-enter", { shell_id: "sh1", text: "Get-ChildItem\n" });
  assert.ok(sentEnter.content[0].text.includes("Sent 14 chars"));
  assert.equal(writes.at(-1), "Get-ChildItem\r");
  assert.ok(runtime.snapshotShell("sh1").plain.includes("seen:Get-ChildItem"));

  const sentLiteralEnter = await byName.terminal_send.execute("tc-literal-enter", { shell_id: "sh1", text: "pwd\\n" });
  assert.ok(sentLiteralEnter.content[0].text.includes("Sent 4 chars"));
  assert.equal(writes.at(-1), "pwd\r");

  const sentCtrlC = await byName.terminal_send.execute("tc-ctrl-c", { shell_id: "sh1", key: "ctrl_c" });
  assert.ok(sentCtrlC.content[0].text.includes("Sent 1 chars"));
  assert.equal(writes.at(-1), "\x03");

  const exec = await byName.terminal_send.execute("tc-exec", { shell_id: "sh1", text: "echo ok\n", wait_for_idle: true, timeout_ms: 1000, idle_ms: 20 });
  assert.ok(exec.content[0].text.includes("seen:echo ok"));
  assert.ok(exec.details.screenDelta.includes("seen:echo ok"));
  assert.equal(writes.at(-1), "echo ok\r");

  const resize = await byName.terminal_resize.execute("tc-resize", { shell_id: "sh1", cols: 100, rows: 20 });
  assert.ok(resize.content[0].text.includes("100x20"));
  assert.equal(resize.details.shell.cols, 100);
  assert.equal(resize.details.shell.rows, 20);

  const listed = await byName.terminal_list.execute("tc3", {});
  assert.ok(listed.content[0].text.includes("dev"));
  assert.equal(listed.details.shells.length, 1);

  const cleared = await byName.terminal_clear.execute("tc-clear", { shell_id: "sh1" });
  assert.ok(cleared.content[0].text.includes("Cleared dev"));
  assert.equal(runtime.snapshotShell("sh1").plain, "");

  const killed = await byName.terminal_kill.execute("tc4", { shell_id: "sh1" });
  assert.ok(killed.content[0].text.includes("Killed dev"));
  assert.equal(killed.details.shell.status, "killed");

  const late = await byName.terminal_send.execute("tc5", { shell_id: "sh1", text: "late" });
  assert.equal(late.details.error, true);
  assert.ok(late.content[0].text.includes("is killed"));

  const missingClear = await byName.terminal_clear.execute("tc-clear-missing", { shell_id: "missing" });
  assert.equal(missingClear.details.error, true);
  assert.ok(missingClear.content[0].text.includes("shell not found"));

  const defaultSpawned = await byName.terminal_spawn.execute("tc6", { name: "default" });
  assert.equal(defaultSpawned.details.shell.name, "default");
  assert.equal(defaultSpawned.details.shell.status, "running");

  console.log("  PASS");
}
