import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export async function runHistorySearchSmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: history search ---");
  const tmp = setupTmp();
  try {
    const { HistoryStore } = await import("../src/history/store.mjs");
    const { createHistorySearchTool } = await import("../src/history/tool.mjs");
    const store = new HistoryStore({ root: resolve(tmp, "history"), cwd: resolve(tmp, "project"), now: () => new Date("2026-05-24T12:00:00.000Z") });

    const file = store.appendTurn({
      sessionStats: { sessionId: "session-1", sessionName: "History Design" },
      runtime: { provider: "deepseek", modelId: "deepseek-chat" },
      turn: {
        index: 1,
        userMessage: "please add history_search",
        assistantMessage: "implemented rg-backed history search",
        thinking: "visible planning summary",
        userRecallHints: [{ id: "mem_user", name: "User Pref", description: "prefers concise design" }],
        assistantRecallHints: [{ id: "mem_agent", name: "Agent Note", description: "reuse ripgrep" }],
        toolCalls: [
          { name: "read", args: { path: "src/a.mjs" }, status: "success" },
          { name: "command_exec", args: { command: "npm run test:fast" }, status: "failed", error: { message: "line limit failed", details: { status: 1 }, excerpt: "runner.mjs has 304 lines" } },
        ],
      },
    });

    assert.ok(existsSync(file));
    const content = readFileSync(file, "utf8");
    assert.match(content, /history_search/);
    assert.match(content, /read status=success/);
    assert.match(content, /command_exec status=failed/);
    assert.match(content, /runner\.mjs has 304 lines/);

    const tool = createHistorySearchTool({ store });
    const result = await tool.execute("tool-call", { query: "runner.mjs", syntax: "literal" });
    assert.equal(result.details.results.length, 1);
    assert.match(result.content[0].text, /runner\.mjs has 304 lines/);

    console.log("  PASS");
  } finally {
    cleanup(tmp);
  }
}
