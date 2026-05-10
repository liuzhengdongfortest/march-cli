import { strict as assert } from "node:assert";
import { createCliShellRuntime } from "../src/shell/cli-runtime.mjs";

const isWindows = process.platform === "win32";
const marker = "MARCH_PTY_ACCEPTANCE_OK";
const newline = isWindows ? "\r\n" : "\n";
const runtime = createCliShellRuntime({ cwd: process.cwd() });

try {
  const shell = runtime.spawnShell({ name: "acceptance" });
  assert.equal(shell.status, "running");

  runtime.sendShell(shell.id, acceptanceCommand());
  const observed = await waitFor(shell.id, () => {
    const snapshot = runtime.snapshotShell(shell.id);
    return snapshot.plain.includes(marker) ? snapshot : null;
  }, 5000);

  assert.ok(observed.plain.includes(marker));
  runtime.sendShell(shell.id, `exit${newline}`);

  await waitFor(shell.id, () => {
    const current = runtime.getShell(shell.id);
    return current?.status === "exited" ? current : null;
  }, 5000);

  const finalShell = runtime.getShell(shell.id);
  assert.equal(finalShell.status, "exited");
  runtime.dispose();
  console.log(`PASS real PTY acceptance: ${finalShell.command} ${finalShell.args.join(" ")}`.trim());
  process.exit(0);
} catch (error) {
  runtime.dispose();
  console.error(error?.stack ?? error?.message ?? String(error));
  process.exit(1);
}

function acceptanceCommand() {
  if (isWindows) {
    return `Write-Output "${marker}"${newline}`;
  }
  return `printf '%s\\n' '${marker}'${newline}`;
}

async function waitFor(shellId, probe, timeoutMs) {
  const started = Date.now();
  for (;;) {
    const value = probe();
    if (value) return value;
    if (Date.now() - started > timeoutMs) {
      const current = runtime.getShell(shellId);
      const snapshot = runtime.snapshotShell(shellId);
      throw new Error(`timeout waiting for shell; status=${current?.status}; output=${JSON.stringify(snapshot.plain)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}
