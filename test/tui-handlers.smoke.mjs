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
  const ui = {
    selectList: async () => null,
    setEscapeHandler: (fn) => { handlers.escape = fn; },
    setCtrlCHandler: (fn) => { handlers.ctrlC = fn; },
    setShiftTabHandler: (fn) => { handlers.shiftTab = fn; },
    setCtrlTHandler: (fn) => { handlers.ctrlT = fn; },
    setCtrlLHandler: (fn) => { handlers.ctrlL = fn; },
    setPasteImageHandler: (fn) => { handlers.pasteImage = fn; },
    setToggleModeHandler: (fn) => { handlers.toggleMode = fn; },
    writeln: (line) => calls.push(["writeln", line]),
    status: (line) => calls.push(["status", line]),
  };
  const runner = {
    abort: () => calls.push(["abort"]),
    cycleThinkingLevel: () => "high",
    getAvailableThinkingLevels: () => ["off", "medium", "high"],
    getThinkingLevel: () => "medium",
    setThinkingLevel: (level) => level,
    getScopedModels: () => [
      { model: { id: "a", name: "A", provider: "p" } },
      { model: { id: "b", provider: "p" } },
    ],
    getCurrentModel: () => ({ id: "a", provider: "p" }),
    setModel: async (model) => model,
    cycleModel: async () => ({ model: { id: "fallback", provider: "p" }, thinkingLevel: "medium" }),
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
  let pasteArgs = null;
  try {
    wireTuiHandlers({
      ui,
      runner,
      sessionState: { sessionId: "state-session" },
      projectMarchDir: "D:/repo/.march",
      refreshStatusBar: () => { refreshCount += 1; },
      isTurnRunning: () => true,
      modeState,
      configHomeDir,
      pasteClipboardImageImpl: (args) => {
        pasteArgs = args;
        return ["Attached image: @.march/attachments/s1/image.png"];
      },
    });

  handlers.escape();
  assert.deepEqual(calls[0], ["abort"]);
  assert.ok(calls.some(([type, line]) => type === "writeln" && line.includes("aborted")));

  handlers.ctrlC();
  assert.deepEqual(calls.filter(([type]) => type === "abort").length, 2);

  handlers.shiftTab();
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
    assert.equal(anchor, "bottom-left");
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
  assert.ok(calls.some(([type, line]) => type === "writeln" && line.includes("model: fallback (p)")));
  assert.equal(refreshCount, 5);
  const fallbackConfig = JSON.parse(readFileSync(join(configHomeDir, ".march", "config.json"), "utf8"));
  assert.equal(fallbackConfig.model, "fallback");

  handlers.pasteImage();
  assert.equal(pasteArgs.projectMarchDir, "D:/repo/.march");
  assert.equal(pasteArgs.sessionId, "runner-session");
  assert.ok(calls.some(([type, line]) => type === "status" && line.includes("Attached image")));
  } finally {
    if (existsSync(configHomeDir)) rmSync(configHomeDir, { recursive: true, force: true });
  }
  console.log("  PASS");
}
