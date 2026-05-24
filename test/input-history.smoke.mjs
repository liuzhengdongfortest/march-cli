import { strict as assert } from "node:assert";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FakeTerminal } from "./helpers/fake-terminal.mjs";

const ARROW_UP = "\x1b[A";
const ARROW_DOWN = "\x1b[B";

export async function runInputHistorySmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: input history persistence ---");
  const dir = setupTmp();
  const { createInputHistoryStore } = await import("../src/cli/input/history-store.mjs");
  const { createTuiUI } = await import("../src/cli/ui.mjs");
  const historyPath = join(dir, ".march", "input-history.json");
  const historyStore = createInputHistoryStore({ path: historyPath });

  assert.deepEqual(historyStore.load(), []);
  mkdirSync(join(dir, ".march"), { recursive: true });
  writeFileSync(historyPath, "not json", "utf8");
  assert.deepEqual(historyStore.load(), []);

  const firstTerminal = new FakeTerminal();
  const firstUi = createTuiUI({ cwd: dir, terminal: firstTerminal, historyStore });
  const firstPending = firstUi.readline("> ");
  firstTerminal.input("hello history");
  firstTerminal.input("\r");
  assert.equal(await firstPending, "hello history");
  await firstUi.close();

  assert.ok(existsSync(historyPath));
  assert.deepEqual(JSON.parse(readFileSync(historyPath, "utf8")), {
    version: 1,
    items: ["hello history"],
  });

  const staleHistoryStore = createInputHistoryStore({ path: historyPath });
  const staleTerminal = new FakeTerminal();
  const staleUi = createTuiUI({ cwd: dir, terminal: staleTerminal, historyStore: staleHistoryStore });
  writeFileSync(historyPath, JSON.stringify({ version: 1, items: ["other session command"] }), "utf8");
  const stalePending = staleUi.readline("> ");
  staleTerminal.input("stale session command");
  staleTerminal.input("\r");
  assert.equal(await stalePending, "stale session command");
  await staleUi.close();
  assert.deepEqual(JSON.parse(readFileSync(historyPath, "utf8")), {
    version: 1,
    items: ["stale session command", "hello history", "other session command"],
  });

  const secondTerminal = new FakeTerminal();
  const secondUi = createTuiUI({ cwd: dir, terminal: secondTerminal, historyStore });
  const secondPending = secondUi.readline("> ");
  secondTerminal.input(ARROW_UP);
  assert.equal(secondUi.getInputText(), "hello history");
  secondTerminal.input(ARROW_DOWN);
  assert.equal(secondUi.getInputText(), "");
  secondUi.requestExit();
  assert.equal(await secondPending, null);
  await secondUi.close();

  cleanup(dir);
  console.log("  PASS");
}
