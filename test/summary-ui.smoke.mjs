import { strict as assert } from "node:assert";
import { stdout } from "node:process";
import { FakeTerminal } from "./helpers/fake-terminal.mjs";

export async function runSummaryUiSmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: silent summary UI ---");
  const { createPlainUI } = await import("../src/cli/fallback-ui.mjs");
  const { createTuiUI } = await import("../src/cli/ui.mjs");
  const dir = setupTmp();

  const terminal = new FakeTerminal();
  const tui = createTuiUI({ cwd: dir, terminal });
  tui.summaryStart();
  tui.summaryDone();
  assert.equal(terminal.writes.join("").includes("summarizing"), false);
  assert.equal(terminal.writes.join("").includes("summary"), false);
  await tui.close();

  const redrawTerminal = new FakeTerminal();
  redrawTerminal.rows = 10;
  const redrawTui = createTuiUI({ cwd: dir, terminal: redrawTerminal });
  for (let i = 0; i < 20; i += 1) redrawTui.writeln(`line ${i}`);
  await new Promise(resolve => setTimeout(resolve, 20));
  redrawTerminal.writes = [];
  redrawTerminal.columns = 100;
  redrawTui.setStatusBar("changed status");
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(redrawTerminal.writes.join("").includes("\x1b[3J"), false);
  await redrawTui.close();

  const writes = [];
  const originalWrite = stdout.write;
  stdout.write = (chunk, ...args) => {
    writes.push(String(chunk));
    const cb = args.find((arg) => typeof arg === "function");
    cb?.();
    return true;
  };
  try {
    const plain = createPlainUI();
    plain.summaryStart();
    plain.summaryDone();
  } finally {
    stdout.write = originalWrite;
  }
  assert.equal(writes.join(""), "");

  cleanup(dir);
  console.log("  PASS");
}
