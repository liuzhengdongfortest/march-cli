import { strict as assert } from "node:assert";

export async function runCommandExecToolSmoke() {
  console.log("--- smoke: command_exec tool ---");
  const { createCommandExecTool, executeCommand, resolveCommandShell } = await import("../src/agent/command-exec-tool.mjs");

  assert.equal(resolveCommandShell("bash", "win32").name, "bash");
  assert.equal(resolveCommandShell("powershell", "linux").name, "powershell");
  assert.equal(createCommandExecTool({ cwd: "D:/repo" }).parameters.properties.timeout.default, 60);

  const calls = [];
  const ok = await executeCommand({
    cwd: "D:/repo",
    command: "echo ok",
    shell: "bash",
    timeout: 2,
    spawnImpl: createMockSpawn({ calls, status: 0, stdout: "ok\n", stderr: "" }),
  });
  assert.equal(ok.content[0].text, "ok");
  assert.equal(ok.details.shell, "bash");
  assert.equal(calls[0].bin, "bash");
  assert.deepEqual(calls[0].args, ["-lc", "echo ok"]);
  assert.equal(calls[0].options.cwd, "D:/repo");
  assert.equal(calls[0].options.windowsHide, true);

  const colored = await executeCommand({
    cwd: "D:/repo",
    command: "colored",
    shell: "bash",
    spawnImpl: createMockSpawn({ status: 0, stdout: "\x1b[32mgreen\x1b[0m\n", stderr: "" }),
  });
  assert.equal(colored.content[0].text, "green");
  assert.equal(colored.details.stdout, "green\n");

  const failed = await executeCommand({
    cwd: "D:/repo",
    command: "bad",
    shell: "bash",
    spawnImpl: createMockSpawn({ status: 2, stdout: "", stderr: "nope\n" }),
  });
  assert.equal(failed.details.error, true);
  assert.ok(failed.content[0].text.includes("nope"));
  assert.ok(failed.content[0].text.includes("exit 2"));

  const unsupported = await executeCommand({ cwd: "D:/repo", command: "x", shell: "fish" });
  assert.equal(unsupported.details.error, true);
  assert.ok(unsupported.content[0].text.includes("unsupported shell"));

  const timeoutKills = [];
  const timedOut = await executeCommand({
    cwd: "D:/repo",
    command: "hang",
    shell: "bash",
    timeout: 0.001,
    forceSettleMs: 1,
    spawnImpl: createMockSpawn({ close: false }),
    killProcessTreeImpl: (child) => timeoutKills.push(child.pid),
  });
  assert.equal(timedOut.details.error, true);
  assert.ok(timedOut.content[0].text.includes("Command timed out"));
  assert.deepEqual(timeoutKills, [1234]);

  const controller = new AbortController();
  controller.abort();
  const abortKills = [];
  const aborted = await executeCommand({
    cwd: "D:/repo",
    command: "hang",
    shell: "bash",
    timeout: 60,
    signal: controller.signal,
    forceSettleMs: 1,
    spawnImpl: createMockSpawn({ close: false }),
    killProcessTreeImpl: (child) => abortKills.push(child.pid),
  });
  assert.equal(aborted.details.error, true);
  assert.ok(aborted.content[0].text.includes("Command aborted"));
  assert.deepEqual(abortKills, [1234]);
  console.log("  PASS");
}

function createMockSpawn({ calls = [], status = 0, stdout = "", stderr = "", signal = null, close = true }) {
  return (bin, args, options) => {
    calls.push({ bin, args, options });
    const listeners = new Map();
    const child = {
      stdout: createMockStream(stdout),
      stderr: createMockStream(stderr),
      pid: 1234,
      kill: () => {},
      once: (event, listener) => {
        listeners.set(event, listener);
        return child;
      },
    };
    if (close) setTimeout(() => listeners.get("close")?.(status, signal), 0);
    return child;
  };
}

function createMockStream(text) {
  const stream = {
    setEncoding: () => {},
    on: (event, listener) => {
      if (event === "data" && text) queueMicrotask(() => listener(text));
      return stream;
    },
  };
  return stream;
}
