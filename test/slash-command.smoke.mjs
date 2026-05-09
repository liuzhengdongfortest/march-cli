import { strict as assert } from "node:assert";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export async function runSlashCommandSmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: slash command handling ---");
  const { handleSlashCommand } = await import("../src/cli/slash-commands.mjs");
  const output = [];
  const ui = { writeln: (text) => output.push(text), toggleMouse: () => false };
  const dir = setupTmp();
  const projectMarchDir = join(dir, ".march");
  const piSessionDir = join(projectMarchDir, "pi-sessions");
  mkdirSync(piSessionDir, { recursive: true });
  writeFileSync(join(piSessionDir, "2026-05-10T00-00-00-000Z_pi.jsonl"), [
    JSON.stringify({ type: "session", version: 3, id: "pi-slash", timestamp: "2026-05-10T00:00:00.000Z", cwd: dir }),
    JSON.stringify({ type: "message", id: "u1", parentId: null, timestamp: "2026-05-10T00:00:01.000Z", message: { role: "user", content: "slash pi", timestamp: 1778342401000 } }),
    JSON.stringify({ type: "message", id: "a1", parentId: "u1", timestamp: "2026-05-10T00:00:02.000Z", message: { role: "assistant", content: [{ type: "text", text: "ok" }], provider: "test", model: "test", usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: "stop", timestamp: 1778342402000 } }),
    "",
  ].join("\n"));
  const runner = {
    engine: {
      cwd: dir,
      modelId: "test-model",
      turns: [1, 2],
      openFiles: new Map(),
      skills: [],
      getPins: () => [],
    },
    cycleThinkingLevel: () => "high",
    getAvailableThinkingLevels: () => ["off", "medium", "high"],
    getThinkingLevel: () => "high",
    setThinkingLevel: (level) => level,
    cycleModel: async () => ({ model: { id: "m2", provider: "test" }, thinkingLevel: "medium" }),
    getCurrentModel: () => ({ id: "m1", name: "Model One", provider: "test" }),
    getScopedModels: () => [{ model: { id: "m1", name: "Model One", provider: "test" } }],
    setModel: async (model) => model,
    canSwitchPiSession: () => true,
    switchPiSession: async () => ({ cancelled: false }),
    compact: async () => ({ summary: "compact summary" }),
    getSessionStats: () => ({
      sessionId: "s1",
      userMessages: 1,
      assistantMessages: 1,
      toolCalls: 0,
      totalMessages: 2,
      tokens: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0 },
      cost: 0.01,
    }),
  };
  const sessionState = { sessionId: "s1", sessionDir: "unused" };
  const status = await handleSlashCommand("/status", { ui, runner, sessionState, sessionsRoot: "unused", projectMarchDir });
  assert.equal(status.handled, true);
  assert.ok(output.join("\n").includes("session: s1"));
  const thinking = await handleSlashCommand("/thinking list", { ui, runner, sessionState, sessionsRoot: "unused", projectMarchDir });
  assert.equal(thinking.handled, true);
  assert.ok(output.join("\n").includes("* 3. high"));
  const indexedThinking = await handleSlashCommand("/thinking 2", { ui, runner, sessionState, sessionsRoot: "unused", projectMarchDir });
  assert.equal(indexedThinking.handled, true);
  assert.ok(output.join("\n").includes("thinking: medium"));
  const model = await handleSlashCommand("/model", { ui, runner, sessionState, sessionsRoot: "unused", projectMarchDir });
  assert.equal(model.handled, true);
  assert.ok(output.join("\n").includes("Model: m2 (test)"));
  const indexedModel = await handleSlashCommand("/model 1", { ui, runner, sessionState, sessionsRoot: "unused", projectMarchDir });
  assert.equal(indexedModel.handled, true);
  assert.ok(output.join("\n").includes("Model: Model One (test)"));
  const session = await handleSlashCommand("/session", { ui, runner, sessionState, sessionsRoot: "unused", projectMarchDir });
  assert.equal(session.handled, true);
  assert.ok(output.join("\n").includes("messages: 1u + 1a + 0t = 2 total"));
  const piSessions = await handleSlashCommand("/sessions pi", { ui, runner, sessionState, sessionsRoot: "unused", projectMarchDir });
  assert.equal(piSessions.handled, true);
  assert.ok(output.join("\n").includes("pi-slash"));
  const resumePi = await handleSlashCommand("/resume-pi pi", { ui, runner, sessionState, sessionsRoot: "unused", projectMarchDir });
  assert.equal(resumePi.handled, true);
  assert.ok(output.join("\n").includes("Resumed pi session: pi-slash"));
  const compact = await handleSlashCommand("/compact", { ui, runner, sessionState, sessionsRoot: "unused", projectMarchDir });
  assert.equal(compact.handled, true);
  assert.ok(output.join("\n").includes("Compacted: 15 char summary"));
  const unknown = await handleSlashCommand("/unknown", { ui, runner, sessionState, sessionsRoot: "unused", projectMarchDir });
  assert.equal(unknown.handled, false);
  cleanup(dir);
  console.log("  PASS");
}
