import { strict as assert } from "node:assert";

export async function runCommandExecToolSmoke() {
  console.log("--- smoke: command_exec tool ---");
  const { executeCommand, resolveCommandShell } = await import("../src/agent/command-exec-tool.mjs");

  assert.equal(resolveCommandShell("bash", "win32").name, "bash");
  assert.equal(resolveCommandShell("powershell", "linux").name, "powershell");

  const calls = [];
  const ok = executeCommand({
    cwd: "D:/repo",
    command: "echo ok",
    shell: "bash",
    timeout: 2,
    spawnSyncImpl: (bin, args, options) => {
      calls.push({ bin, args, options });
      return { status: 0, stdout: "ok\n", stderr: "" };
    },
  });
  assert.equal(ok.content[0].text, "ok");
  assert.equal(ok.details.shell, "bash");
  assert.equal(calls[0].bin, "bash");
  assert.deepEqual(calls[0].args, ["-lc", "echo ok"]);
  assert.equal(calls[0].options.cwd, "D:/repo");
  assert.equal(calls[0].options.timeout, 2000);

  const colored = executeCommand({
    cwd: "D:/repo",
    command: "colored",
    shell: "bash",
    spawnSyncImpl: () => ({ status: 0, stdout: "\x1b[32mgreen\x1b[0m\n", stderr: "" }),
  });
  assert.equal(colored.content[0].text, "green");
  assert.equal(colored.details.stdout, "green\n");

  const failed = executeCommand({
    cwd: "D:/repo",
    command: "bad",
    shell: "bash",
    spawnSyncImpl: () => ({ status: 2, stdout: "", stderr: "nope\n" }),
  });
  assert.equal(failed.details.error, true);
  assert.ok(failed.content[0].text.includes("nope"));
  assert.ok(failed.content[0].text.includes("exit 2"));

  const unsupported = executeCommand({ cwd: "D:/repo", command: "x", shell: "fish" });
  assert.equal(unsupported.details.error, true);
  assert.ok(unsupported.content[0].text.includes("unsupported shell"));
  console.log("  PASS");
}
