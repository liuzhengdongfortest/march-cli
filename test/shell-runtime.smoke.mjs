import { strict as assert } from "node:assert";

export async function runShellRuntimeSmoke() {
  console.log("--- smoke: shell runtime ---");
  const { createShellRuntime, stripAnsi } = await import("../src/shell/runtime.mjs");
  const adapters = new Map();
  const screens = [];
  let nextId = 1;
  const runtime = createShellRuntime({
    idFactory: () => `sh${nextId++}`,
    now: () => new Date("2026-05-10T00:00:00.000Z"),
    maxScrollbackLines: 3,
    createScreenBuffer: ({ cols, rows }) => {
      const screen = {
        cols,
        rows,
        writes: [],
        disposed: false,
        write: (text) => screen.writes.push(text),
        resize: (nextCols, nextRows) => {
          screen.cols = nextCols;
          screen.rows = nextRows;
        },
        snapshot: () => ({
          cols: screen.cols,
          rows: screen.rows,
          plain: stripAnsi(screen.writes.join("")).replace(/\r/g, "").trim(),
          ansi: screen.writes.join("").trim(),
        }),
        dispose: () => {
          screen.disposed = true;
        },
      };
      screens.push(screen);
      return screen;
    },
    createPty: ({ onData, onExit, onError }) => {
      const adapter = {
        writes: [],
        resizes: [],
        write: (text) => {
          adapter.writes.push(text);
          onData(`\x1b[32mout:${text}\x1b[0m\n`);
        },
        resize: (cols, rows) => adapter.resizes.push([cols, rows]),
        kill: () => onExit({ exitCode: null, signal: "SIGTERM" }),
        fail: () => onError(new Error("boom")),
      };
      adapters.set(`pty${adapters.size + 1}`, adapter);
      return adapter;
    },
  });

  assert.equal(stripAnsi("\x1b[31mred\x1b[0m"), "red");

  const first = runtime.spawnShell({ name: "dev", command: "powershell.exe", args: ["-NoLogo"], cwd: "D:/repo", cols: 120, rows: 30 });
  const second = runtime.spawnShell({ name: "dev", command: "powershell.exe" });
  assert.equal(first.id, "sh1");
  assert.equal(first.status, "running");
  assert.equal(first.cols, 120);
  assert.equal(first.rows, 30);
  assert.equal(second.name, "dev-2");

  const send = runtime.sendShell("sh1", "hello");
  assert.equal(send.ok, true);
  assert.deepEqual([...adapters.values()][0].writes, ["hello"]);
  assert.equal(runtime.snapshotShell("sh1").plain, "out:hello");
  assert.ok(runtime.snapshotShell("sh1").ansi.includes("\x1b[32m"));
  assert.equal(runtime.snapshotShell("sh1").screen.plain, "out:hello");
  assert.deepEqual(runtime.searchShell("sh1", "hello").matches.map((match) => match.line), ["out:hello"]);
  assert.deepEqual(runtime.resizeShell("sh1", { cols: 120, rows: 30 }), { ok: true, changed: false, shell: runtime.getShell("sh1") });
  const resized = runtime.resizeShell("sh1", { cols: 100.9, rows: 12.1 });
  assert.equal(resized.ok, true);
  assert.equal(resized.changed, true);
  assert.deepEqual([...adapters.values()][0].resizes, [[100, 12]]);
  assert.equal(runtime.getShell("sh1").cols, 100);
  assert.equal(runtime.getShell("sh1").rows, 12);
  assert.equal(runtime.snapshotShell("sh1").screen.cols, 100);
  assert.equal(runtime.snapshotShell("sh1").screen.rows, 12);

  runtime.sendShell("sh1", "one");
  runtime.sendShell("sh1", "two");
  runtime.sendShell("sh1", "three");
  assert.equal(runtime.snapshotShell("sh1").plain, ["out:one", "out:two", "out:three"].join("\n"));

  const killed = runtime.killShell("sh1");
  assert.equal(killed.ok, true);
  assert.equal(runtime.getShell("sh1").status, "killed");
  assert.equal(runtime.sendShell("sh1", "late").ok, false);
  assert.equal(runtime.resizeShell("sh1", { cols: 90, rows: 20 }).ok, false);
  assert.equal(runtime.getShell("sh1").cols, 100);

  assert.equal(runtime.killAll().length, 1);
  assert.equal(runtime.getShell("sh2").status, "killed");
  runtime.dispose();
  assert.equal(screens[0].disposed, true);
  assert.equal(screens[1].disposed, true);

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

  const defaultRuntime = createShellRuntime({
    idFactory: () => "default",
    defaultCommand: "pwsh",
    defaultArgs: ["-NoLogo"],
    createPty: ({ command, args, onExit }) => ({
      command,
      args,
      disposed: false,
      write: () => {},
      kill: () => onExit({ signal: "SIGTERM" }),
      dispose() {
        this.disposed = true;
      },
    }),
  });
  const defaultShell = defaultRuntime.spawnShell();
  assert.equal(defaultShell.command, "pwsh");
  assert.deepEqual(defaultShell.args, ["-NoLogo"]);
  assert.equal(defaultRuntime.dispose().length, 1);
  assert.equal(defaultRuntime.getShell("default").status, "killed");

  const killFailureRuntime = createShellRuntime({
    idFactory: () => "kill-failure",
    createPty: () => ({
      write: () => {},
      kill: () => {
        throw new Error("nope");
      },
    }),
  });
  killFailureRuntime.spawnShell({ command: "pwsh" });
  const killFailure = killFailureRuntime.killShell("kill-failure");
  assert.equal(killFailure.ok, false);
  assert.equal(killFailure.shell.status, "failed");
  assert.ok(killFailure.error.includes("kill failed"));

  const resizeUnsupportedRuntime = createShellRuntime({
    idFactory: () => "no-resize",
    createPty: () => ({
      write: () => {},
      kill: () => {},
    }),
  });
  resizeUnsupportedRuntime.spawnShell({ command: "pwsh", cols: 80, rows: 24 });
  const unsupportedResize = resizeUnsupportedRuntime.resizeShell("no-resize", { cols: 90, rows: 30 });
  assert.equal(unsupportedResize.ok, false);
  assert.equal(resizeUnsupportedRuntime.getShell("no-resize").cols, 80);

  console.log("  PASS");
}
