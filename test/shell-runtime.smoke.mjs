import { strict as assert } from "node:assert";

export async function runShellRuntimeSmoke() {
  console.log("--- smoke: shell runtime ---");
  const { createShellRuntime, stripAnsi } = await import("../src/shell/runtime.mjs");
  const adapters = new Map();
  let nextId = 1;
  const runtime = createShellRuntime({
    idFactory: () => `sh${nextId++}`,
    now: () => new Date("2026-05-10T00:00:00.000Z"),
    maxScrollbackLines: 3,
    createPty: ({ onData, onExit, onError }) => {
      const adapter = {
        writes: [],
        write: (text) => {
          adapter.writes.push(text);
          onData(`\x1b[32mout:${text}\x1b[0m\n`);
        },
        kill: () => onExit({ exitCode: null, signal: "SIGTERM" }),
        fail: () => onError(new Error("boom")),
      };
      adapters.set(`pty${adapters.size + 1}`, adapter);
      return adapter;
    },
  });

  assert.equal(stripAnsi("\x1b[31mred\x1b[0m"), "red");

  const first = runtime.spawnShell({ name: "dev", command: "powershell.exe", args: ["-NoLogo"], cwd: "D:/repo" });
  const second = runtime.spawnShell({ name: "dev", command: "powershell.exe" });
  assert.equal(first.id, "sh1");
  assert.equal(first.status, "running");
  assert.equal(second.name, "dev-2");

  const send = runtime.sendShell("sh1", "hello");
  assert.equal(send.ok, true);
  assert.deepEqual([...adapters.values()][0].writes, ["hello"]);
  assert.equal(runtime.snapshotShell("sh1").plain, "out:hello");
  assert.ok(runtime.snapshotShell("sh1").ansi.includes("\x1b[32m"));
  assert.deepEqual(runtime.searchShell("sh1", "hello").matches.map((match) => match.line), ["out:hello"]);

  runtime.sendShell("sh1", "one");
  runtime.sendShell("sh1", "two");
  runtime.sendShell("sh1", "three");
  assert.equal(runtime.snapshotShell("sh1").plain, ["out:one", "out:two", "out:three"].join("\n"));

  const killed = runtime.killShell("sh1");
  assert.equal(killed.ok, true);
  assert.equal(runtime.getShell("sh1").status, "killed");
  assert.equal(runtime.sendShell("sh1", "late").ok, false);

  assert.equal(runtime.killAll().length, 1);
  assert.equal(runtime.getShell("sh2").status, "killed");

  assert.throws(() => runtime.sendShell("missing", "x"), /shell not found/);

  const failedRuntime = createShellRuntime({
    idFactory: () => "bad",
    createPty: () => {
      throw new Error("spawn failed");
    },
  });
  const failed = failedRuntime.spawnShell({ command: "missing.exe" });
  assert.equal(failed.status, "failed");
  assert.equal(failed.error, "spawn failed");

  console.log("  PASS");
}
