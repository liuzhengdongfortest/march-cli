import { strict as assert } from "node:assert";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export async function runTuiHandlersSmoke() {
  console.log("--- smoke: TUI handler wiring ---");
  const { wireTuiHandlers } = await import("../src/cli/tui/tui-handlers.mjs");

  const calls = [];
  const configHomeDir = mkdtempSync(join(tmpdir(), "march-tui-handlers-"));
  const handlers = {};
  let turnRunning = true;
  let exitCalls = 0;
  const ui = {
    selectList: async () => null,
    setEscapeHandler: (fn) => { handlers.escape = fn; },
    setCtrlCHandler: (fn) => { handlers.ctrlC = fn; },
    setShiftTabHandler: (fn) => { handlers.shiftTab = fn; },
    setCtrlTHandler: (fn) => { handlers.ctrlT = fn; },
    setCtrlLHandler: (fn) => { handlers.ctrlL = fn; },
    setPasteImageHandler: (fn) => { handlers.pasteImage = fn; },
    setToggleModeHandler: (fn) => { handlers.toggleMode = fn; },
    requestExit: () => { exitCalls += 1; },
    writeln: (line) => calls.push(["writeln", line]),
    status: (line) => calls.push(["status", line]),
  };
  const runner = {
    abort: () => calls.push(["abort"]),
    getAvailableThinkingLevels: () => ["off", "medium", "high"],
    getThinkingLevel: () => "medium",
    setThinkingLevel: (level) => level,
    getScopedModels: () => [
      { model: { id: "a", name: "A", provider: "p" } },
      { model: { id: "b", provider: "p" } },
    ],
    getCurrentModel: () => ({ id: "a", provider: "p" }),
    setModel: async (model) => model,
    getSessionStats: () => ({ sessionId: "runner-session" }),
  };
  const modeState = {
    mode: "do",
    toggle() {
      this.mode = this.mode === "do" ? "discuss" : "do";
      return this.mode;
    },
  };
  let refreshCount = 0;
  let abortStatusCount = 0;
  const refreshStatusBar = () => { refreshCount += 1; };
  refreshStatusBar.markAborted = () => { abortStatusCount += 1; };
  let pasteArgs = null;
  try {
    wireTuiHandlers({
      ui,
      runner,
      sessionState: { sessionId: "state-session" },
      projectMarchDir: "D:/repo/.march",
      refreshStatusBar,
      isTurnRunning: () => turnRunning,
      modeState,
      configHomeDir,
      pasteClipboardImageImpl: (args) => {
        pasteArgs = args;
        return ["Attached image: @.march/attachments/s1/image.png"];
      },
    });

  handlers.escape();
  assert.deepEqual(calls[0], ["abort"]);
  assert.equal(abortStatusCount, 1);
  assert.equal(calls.some(([type, line]) => type === "writeln" && line.includes("aborted")), false);

  handlers.ctrlC();
  assert.deepEqual(calls.filter(([type]) => type === "abort").length, 2);
  assert.equal(abortStatusCount, 2);

  turnRunning = false;
  handlers.ctrlC();
  assert.equal(exitCalls, 0);
  assert.ok(calls.some(([type, line]) => type === "status" && line.includes("press Ctrl+C again")));
  handlers.ctrlC();
  assert.equal(exitCalls, 1);

  ui.selectList = async ({ items }) => items[2];
  await handlers.shiftTab();
  assert.ok(calls.some(([type, line]) => type === "writeln" && line.includes("thinking: high")));
  assert.equal(refreshCount, 1);

  const writtenBeforeModeToggle = calls.filter(([type]) => type === "writeln").length;
  handlers.toggleMode();
  assert.equal(modeState.mode, "discuss");
  assert.equal(refreshCount, 2);
  assert.equal(calls.filter(([type]) => type === "writeln").length, writtenBeforeModeToggle);

  ui.selectList = async () => ({ level: "off" });
  await handlers.ctrlT();
  assert.ok(calls.some(([type, line]) => type === "writeln" && line.includes("thinking: off")));
  assert.equal(refreshCount, 3);

  ui.selectList = async ({ items, anchor }) => {
    assert.equal(anchor, undefined);
    return items[1];
  };
  await handlers.ctrlL();
  assert.ok(calls.some(([type, line]) => type === "writeln" && line.includes("model: b (p)")));
  assert.equal(refreshCount, 4);
  const modelConfig = JSON.parse(readFileSync(join(configHomeDir, ".march", "config.json"), "utf8"));
  assert.equal(modelConfig.provider, "p");
  assert.equal(modelConfig.model, "b");

  runner.getScopedModels = () => [];
  await handlers.ctrlL();
  assert.ok(calls.some(([type, line]) => type === "writeln" && line.includes("model: no selector available")));
  assert.equal(refreshCount, 4);
  const fallbackConfig = JSON.parse(readFileSync(join(configHomeDir, ".march", "config.json"), "utf8"));
  assert.equal(fallbackConfig.model, "b");

  handlers.pasteImage();
  assert.equal(pasteArgs.projectMarchDir, "D:/repo/.march");
  assert.equal(pasteArgs.sessionId, "runner-session");
  assert.ok(calls.some(([type, line]) => type === "status" && line.includes("Attached image")));
  } finally {
    if (existsSync(configHomeDir)) rmSync(configHomeDir, { recursive: true, force: true });
  }
  console.log("  PASS");
}
