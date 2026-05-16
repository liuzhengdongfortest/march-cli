import { strict as assert } from "node:assert";
import {
  runModelCommandSmoke,
  runSelectorListSmoke,
} from "./command-smoke.mjs";
import {
  runPiSessionSwitchCommandSmoke,
  runSessionCommandSmoke,
  runSessionListCommandSmoke,
  runSessionSwitchCommandSmoke,
} from "./session-command-smoke.mjs";
import { runPiSessionCloneCommandSmoke } from "./pi-session-clone-command.smoke.mjs";
import { runPiSessionForkCommandSmoke } from "./pi-session-fork-command.smoke.mjs";
import { runPiSessionForkResetSmoke } from "./pi-session-fork-reset.smoke.mjs";
import { runHelpCommandSmoke } from "./help-command.smoke.mjs";
import { runSessionSourceCommandSmoke } from "./session-source-command.smoke.mjs";
import { runRunnerCleanupSmoke } from "./runner-cleanup.smoke.mjs";
import { runRunnerRuntimeHostSmoke } from "./runner-runtime-host.smoke.mjs";
import { runRunnerTurnFlowSmoke } from "./runner-turn-flow.smoke.mjs";
import { runRuntimeFactorySmoke } from "./runtime-factory.smoke.mjs";
import { runRuntimeHostSmoke } from "./runtime-host.smoke.mjs";
import { runSessionOptionsSmoke } from "./session-options.smoke.mjs";
import { runShellCommandSmoke } from "./shell-command.smoke.mjs";
import { runShellDrawerControlsSmoke } from "./shell-drawer-controls.smoke.mjs";
import { runSlashCommandSmoke } from "./slash-command.smoke.mjs";
import { runTurnEventsSmoke } from "./turn-events.smoke.mjs";
import { runDefaultStartupFlowSmoke } from "./default-startup-flow.smoke.mjs";
import { runEditorSelectListSmoke } from "./editor-select-list.smoke.mjs";
import { runExportCommandSmoke } from "./export-command.smoke.mjs";
import { runStatusBarSmoke } from "./status-bar.smoke.mjs";
import { runStatusCommandSmoke } from "./status-command.smoke.mjs";
import { runContextShellLayersSmoke } from "./context-shell-layers.smoke.mjs";
import { runTuiHandlersSmoke } from "./tui-handlers.smoke.mjs";
import { runRetryStatusSmoke } from "./retry-status.smoke.mjs";
import { runSpinnerStatusSmoke } from "./spinner-status.smoke.mjs";
import { runTuiDiffRenderingSmoke } from "./tui-diff-rendering.smoke.mjs";
import { runToolRenderingSmoke } from "./tool-rendering.smoke.mjs";

export async function runCliCommandSuiteSmoke({ setupTmp, cleanup }) {
  await runThinkingCommandHandlingSmoke();
  await runContextShellLayersSmoke();
  await runExportCommandSmoke({ setupTmp, cleanup });
  await runStatusCommandSmoke({ setupTmp, cleanup });
  await runStatusBarSmoke();
  await runSpinnerStatusSmoke();
  await runTuiDiffRenderingSmoke();
  await runRetryStatusSmoke();
  await runToolRenderingSmoke();
  await runTuiHandlersSmoke();
  await runEditorSelectListSmoke();
  await runSelectorListSmoke();
  await runModelCommandSmoke();
  await runSessionCommandSmoke();
  await runSessionListCommandSmoke();
  await runSessionSwitchCommandSmoke({ setupTmp, cleanup });
  await runPiSessionSwitchCommandSmoke();
  await runPiSessionCloneCommandSmoke({ setupTmp, cleanup });
  await runPiSessionForkCommandSmoke();
  await runPiSessionForkResetSmoke({ setupTmp, cleanup });
  await runHelpCommandSmoke();
  await runSessionSourceCommandSmoke({ setupTmp, cleanup });
  await runSlashCommandSmoke({ setupTmp, cleanup });
  await runSessionOptionsSmoke();
  await runShellCommandSmoke();
  await runShellDrawerControlsSmoke();
  await runTurnEventsSmoke();
  await runRunnerCleanupSmoke();
  await runRunnerTurnFlowSmoke({ setupTmp, cleanup });
  await runRuntimeFactorySmoke();
  await runRuntimeHostSmoke();
  await runRunnerRuntimeHostSmoke();
  await runDefaultStartupFlowSmoke({ setupTmp, cleanup });
}

async function runThinkingCommandHandlingSmoke() {
  console.log("--- smoke: thinking command handling ---");
  const {
    buildThinkingSelectItems,
    formatThinkingLevels,
    handleThinkingCommand,
    parseThinkingCommand,
    selectThinkingByIndex,
  } = await import("../src/cli/commands/thinking-command.mjs");

  assert.deepEqual(parseThinkingCommand("hello"), { type: "none" });
  assert.deepEqual(parseThinkingCommand("/thinking"), { type: "select-interactive" });
  assert.deepEqual(parseThinkingCommand("/thinking list"), { type: "list" });
  assert.deepEqual(parseThinkingCommand("/thinking high"), { type: "set", level: "high" });
  assert.deepEqual(parseThinkingCommand("/thinking 2"), { type: "select", index: 2 });
  assert.equal(parseThinkingCommand("/thinking invalid").type, "error");
  assert.deepEqual(formatThinkingLevels(["off", "medium"], "medium"), [
    "  1. off",
    "* 2. medium",
    "Use /thinking <index> to select.",
  ]);
  assert.deepEqual(buildThinkingSelectItems(["off", "medium"], "medium"), [
    { value: "0", label: "off", description: "", level: "off" },
    { value: "1", label: "medium", description: "current", level: "medium" },
  ]);

  let level = "medium";
  const runner = {
    getAvailableThinkingLevels: () => ["off", "medium", "high"],
    getThinkingLevel: () => level,
    setThinkingLevel: (next) => {
      level = next;
      return level;
    },
  };
  assert.deepEqual(await handleThinkingCommand({ type: "select-interactive" }, { runner }), ["Use /thinking list or run in TUI to choose a thinking level."]);
  assert.deepEqual(await handleThinkingCommand({ type: "select-interactive" }, { runner, ui: { selectList: async ({ items }) => items[0] } }), ["thinking: off"]);
  assert.equal(selectThinkingByIndex(2, { runner }), "thinking: medium");
  assert.equal(selectThinkingByIndex(4, { runner }), "Error: thinking index out of range: 4");
  assert.deepEqual(await handleThinkingCommand({ type: "set", level: "off" }, { runner }), ["thinking: off"]);
  assert.deepEqual(await handleThinkingCommand({ type: "list" }, { runner }), [
    "* 1. off",
    "  2. medium",
    "  3. high",
    "Use /thinking <index> to select.",
  ]);
  console.log("  PASS");
}
