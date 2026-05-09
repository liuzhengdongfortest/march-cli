import { strict as assert } from "node:assert";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export async function runRunnerImageAttachmentsSmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: runner image attachments ---");
  const { createRunner } = await import("../src/agent/runner.mjs");
  const dir = setupTmp();
  const projectMarchDir = join(dir, ".march");
  const attachmentDir = join(projectMarchDir, "attachments", "s1");
  mkdirSync(attachmentDir, { recursive: true });
  writeFileSync(join(attachmentDir, "image.png"), Buffer.from([1, 2, 3]));
  writeFileSync(join(attachmentDir, "image.json"), JSON.stringify({ mimeType: "image/png" }));

  const previousKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = previousKey || "test-key";
  const promptCalls = [];
  const session = {
    model: { id: "deepseek-v4-pro", provider: "deepseek" },
    thinkingLevel: "medium",
    sessionManager: { isPersisted: () => false },
    subscribe: () => () => {},
    async prompt(prompt, options) {
      promptCalls.push({ prompt, options });
    },
    getActiveToolNames: () => ["read"],
    setActiveToolsByName(names) {
      this.activeTools = names;
    },
    setThinkingLevel(level) {
      this.thinkingLevel = level;
    },
    getToolDefinition: () => ({ description: "read", parameters: { properties: {} } }),
    getSessionStats: () => ({
      sessionId: "s1",
      userMessages: 1,
      assistantMessages: 0,
      toolCalls: 0,
      totalMessages: 1,
      tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      cost: 0,
    }),
    dispose: () => {},
  };

  const ui = {
    turnStart: () => {},
    turnEnd: () => {},
    summaryStart: () => {},
    summaryDone: () => {},
  };
  const runner = await createRunner({
    cwd: dir,
    modelId: "deepseek-v4-pro",
    provider: "deepseek",
    stateRoot: join(dir, ".state"),
    ui,
    skills: [],
    pins: [],
    projectMarchDir,
    createAgentSessionImpl: async () => ({ session }),
  });

  await runner.runTurn("ctx\n\n[user]\nsee @.march/attachments/s1/image.png", "see @.march/attachments/s1/image.png");
  assert.equal(promptCalls.length, 2);
  assert.deepEqual(promptCalls[0].options.images, [{ type: "image", mimeType: "image/png", data: "AQID" }]);
  assert.equal(promptCalls[1].options, undefined);

  if (previousKey === undefined) {
    delete process.env.DEEPSEEK_API_KEY;
  } else {
    process.env.DEEPSEEK_API_KEY = previousKey;
  }
  cleanup(dir);
  console.log("  PASS");
}
