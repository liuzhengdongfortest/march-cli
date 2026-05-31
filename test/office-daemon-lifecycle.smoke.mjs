import { strict as assert } from "node:assert";
import { createServer } from "node:net";
import { join } from "node:path";
import { formatOfficeDaemonStartupError, officeDaemonLogPath } from "../src/office/client/lifecycle.mjs";
import { officeDaemonStatePath, writeOfficeDaemonState } from "../src/office/client/state.mjs";
import { runOfficeCommand } from "../src/office/cli/command.mjs";

export async function runOfficeDaemonLifecycleSmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: office daemon lifecycle diagnostics ---");

  const stateRoot = setupTmp();
  try {
    const port = await reserveUnusedPort();
    writeOfficeDaemonState(stateRoot, {
      pid: 12345,
      url: `http://127.0.0.1:${port}`,
      wsUrl: `ws://127.0.0.1:${port}/addin`,
      startedAt: Date.now(),
    });

    const output = await captureStdout(() => runOfficeCommand({ command: { args: ["status"] } }, { stateRoot }));
    assert.match(output, /Office daemon: not running/);
    assert.match(output, /Reason: /);
    assert.match(output, /State file: /);
    assert.match(output, /Log: /);

    const startupError = formatOfficeDaemonStartupError({
      childPid: 777,
      childState: { exited: true, exitCode: 1, signal: null, error: null },
      statePath: join(stateRoot, "missing-state.json"),
      state: null,
      logPath: officeDaemonLogPath(stateRoot),
      lastError: new Error("state file missing"),
    });
    assert.match(startupError, /childPid=777/);
    assert.match(startupError, /child=exit:1/);
    assert.match(startupError, /stateFile=.*missing/);
    assert.match(startupError, /lastError=state file missing/);
    assert.equal(officeDaemonStatePath(stateRoot).endsWith("office-daemon.json"), true);
  } finally {
    cleanup(stateRoot);
  }

  console.log("  PASS");
}

async function reserveUnusedPort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const port = address.port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function captureStdout(fn) {
  const originalWrite = process.stdout.write;
  let output = "";
  process.stdout.write = function write(chunk, ...args) {
    output += String(chunk);
    const callback = args.find((arg) => typeof arg === "function");
    callback?.();
    return true;
  };
  try {
    await fn();
    return output;
  } finally {
    process.stdout.write = originalWrite;
  }
}
