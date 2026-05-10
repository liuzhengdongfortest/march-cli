import { strict as assert } from "node:assert";

export async function runNodePtyAdapterSmoke() {
  console.log("--- smoke: node-pty adapter ---");
  const { createNodePtyAdapterFactory, resolveShellCommand } = await import("../src/shell/node-pty-adapter.mjs");

  assert.deepEqual(resolveShellCommand({ platform: "win32" }), {
    command: "powershell.exe",
    args: ["-NoLogo", "-NoProfile"],
  });
  assert.deepEqual(resolveShellCommand({ command: "pwsh.exe", args: ["-NoLogo"], platform: "win32" }), {
    command: "pwsh.exe",
    args: ["-NoLogo"],
  });

  const calls = [];
  let onDataHandler = null;
  let onExitHandler = null;
  const fakePty = {
    spawn: (command, args, options) => {
      calls.push({ command, args, options });
      return {
        onData: (fn) => { onDataHandler = fn; },
        onExit: (fn) => { onExitHandler = fn; },
        write: (text) => calls.push({ write: text }),
        kill: () => calls.push({ kill: true }),
        _socket: { destroy: () => calls.push({ socketDestroy: true }) },
        destroy: () => calls.push({ destroy: true }),
      };
    },
  };
  const createAdapter = createNodePtyAdapterFactory({
    ptyModule: fakePty,
    defaultCwd: "D:/repo",
    defaultEnv: { A: "B" },
    platform: "win32",
  });
  const events = [];
  const adapter = createAdapter({
    onData: (chunk) => events.push(["data", chunk]),
    onExit: (event) => events.push(["exit", event]),
  });

  assert.equal(calls[0].command, "powershell.exe");
  assert.deepEqual(calls[0].args, ["-NoLogo", "-NoProfile"]);
  assert.equal(calls[0].options.cwd, "D:/repo");
  assert.equal(calls[0].options.env.A, "B");
  adapter.write("hello");
  adapter.kill();
  adapter.dispose();
  onDataHandler("out");
  onExitHandler({ exitCode: 0 });
  assert.deepEqual(calls.slice(1), [{ write: "hello" }, { socketDestroy: true }]);
  assert.deepEqual(events, [["data", "out"], ["exit", { exitCode: 0 }]]);

  calls.length = 0;
  onExitHandler = null;
  const naturalExitAdapter = createAdapter({
    onExit: (event) => events.push(["natural-exit", event]),
  });
  onExitHandler({ exitCode: 0 });
  naturalExitAdapter.dispose();
  assert.deepEqual(calls.slice(1), [{ socketDestroy: true }]);

  console.log("  PASS");
}
