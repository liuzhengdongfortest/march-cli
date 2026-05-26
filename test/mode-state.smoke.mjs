import { strict as assert } from "node:assert";

export async function runModeStateSmoke() {
  console.log("--- smoke: do/discuss mode prompt insertion ---");
  const { appendModeReminder, createModeState, formatModeLabel, formatModeReminder } = await import("../src/cli/input/mode-state.mjs");
  const { runSingleShotPrompt } = await import("../src/cli/repl-loop.mjs");

  const modeState = createModeState();
  assert.equal(modeState.get(), "do");
  assert.equal(formatModeLabel(modeState.get()), "Do");
  assert.equal(modeState.toggle(), "discuss");
  assert.equal(formatModeLabel(modeState.get()), "Discuss");
  assert.ok(formatModeReminder("discuss").includes("Do not edit files"));
  assert.ok(appendModeReminder("hello", "do").includes("<mode>"));

  const prompts = [];
  const userMessages = [];
  const uiLines = [];
  let memoryBeginCount = 0;
  let memoryEndCount = 0;
  await runSingleShotPrompt({
    prompt: "please inspect",
    runner: {
      engine: {
        buildContext: () => "[system]\nctx",
      },
      shellRuntime: {
        listShells: () => [{
          id: "sh1",
          name: "dev",
          status: "running",
          command: "npm",
          args: ["run", "dev"],
          cwd: "D:/repo",
          scrollbackLineCount: 42,
        }],
      },
      runTurn: async (fullPrompt, userMessage) => {
        prompts.push(fullPrompt);
        userMessages.push(userMessage);
      },
    },
    memoryStore: {
      beginTurn() { memoryBeginCount += 1; },
      recallForUser: () => [],
      endTurn() { memoryEndCount += 1; },
    },
    currentProject: "project",
    ui: {
      writeln: (line) => uiLines.push(line),
      recall: ({ hints }) => uiLines.push(`recall:${hints.map((hint) => hint.id).join(",")}`),
    },
    sessionState: { sessionDir: "unused" },
    refreshStatusBar() {},
    refreshStatusBar() {},
    modeState,
  });

  assert.equal(userMessages[0], "please inspect");
  assert.ok(prompts[0].startsWith("please inspect\n\n<mode>"));
  assert.ok(!prompts[0].includes("[system]"));
  assert.ok(prompts[0].includes("You are in discuss mode"));
  assert.ok(prompts[0].includes("[shell_hints]"));
  assert.ok(prompts[0].includes("sh1 dev running command: npm run dev cwd: D:/repo lines: 42"));
  assert.ok(prompts[0].includes("Use terminal_read or terminal_snapshot"));
  assert.ok(!userMessages[0].includes("<mode>"));
  assert.ok(uiLines.join("\n").includes("please inspect"));
  assert.equal(memoryBeginCount, 1);
  assert.equal(memoryEndCount, 1);
  console.log("  PASS");
}
