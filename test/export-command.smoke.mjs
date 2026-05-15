import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export async function runExportCommandSmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: export command ---");
  const {
    buildSessionHtml,
    buildSessionJsonlRecords,
    createSessionGist,
    exportSessionHtml,
    exportSessionJsonl,
    handleExportCommand,
    parseExportCommand,
  } = await import("../src/cli/commands/export-command.mjs");
  const dir = setupTmp();
  const projectMarchDir = join(dir, ".march");
  const now = new Date("2026-05-10T01:02:03.004Z");
  const engine = {
    cwd: dir,
    provider: "deepseek",
    modelId: "deepseek-chat",
    thinkingLevel: "medium",
    sessionName: "Sprint",
    turns: [
      { index: 1, userMessage: "hello", assistantMessage: "hi" },
      { index: 2, userMessage: "ship", assistantMessage: "done" },
    ],
  };
  const sessionStats = {
    sessionId: "s/1",
    sessionFile: "s1.jsonl",
    userMessages: 2,
    assistantMessages: 2,
    toolCalls: 0,
    totalMessages: 4,
    tokens: { input: 1, output: 2 },
    cost: 0.01,
  };

  assert.deepEqual(parseExportCommand("hello"), { type: "none" });
  assert.deepEqual(parseExportCommand("/exportjsonl"), { type: "none" });
  assert.deepEqual(parseExportCommand("/export jsonl"), { type: "jsonl" });
  assert.deepEqual(parseExportCommand("/export html"), { type: "html" });
  assert.deepEqual(parseExportCommand("/export gist html"), { type: "gist", format: "html" });
  assert.equal(parseExportCommand("/export gist").message, "usage: /export gist <jsonl|html>");
  assert.equal(parseExportCommand("/export gist xml").message, "unsupported gist export format: xml");
  assert.equal(parseExportCommand("/export").type, "error");
  assert.equal(parseExportCommand("/export xml").message, "unsupported export format: xml");

  const records = buildSessionJsonlRecords({
    engine,
    sessionStats,
    sessionState: { sessionId: "legacy" },
    sessionSource: "pi",
    now,
  });
  assert.equal(records[0].type, "session");
  assert.equal(records[0].sessionId, "s/1");
  assert.equal(records[0].sessionName, "Sprint");
  assert.equal(records[1].type, "turn");
  assert.equal(records[2].assistantMessage, "done");

  const exported = exportSessionJsonl({
    engine,
    sessionStats,
    sessionState: { sessionId: "legacy" },
    sessionSource: "pi",
    projectMarchDir,
    now,
  });
  assert.equal(exported.turnCount, 2);
  assert.ok(exported.path.endsWith("2026-05-10T01-02-03-004Z_s_1.jsonl"));
  assert.ok(existsSync(exported.path));
  const lines = readFileSync(exported.path, "utf8").trim().split("\n").map((line) => JSON.parse(line));
  assert.equal(lines.length, 3);
  assert.equal(lines[0].source, "pi");
  assert.equal(lines[1].userMessage, "hello");

  const html = buildSessionHtml(records);
  assert.ok(html.includes("<!doctype html>"));
  assert.ok(html.includes("Sprint"));
  assert.ok(html.includes("Turn 2"));
  assert.ok(!html.includes("Summary"));
  const escapedHtml = buildSessionHtml([{ type: "session", sessionName: "<bad>" }, { type: "turn", index: 1, userMessage: "<u>", assistantMessage: "&a" }]);
  assert.ok(escapedHtml.includes("&lt;bad&gt;"));
  assert.ok(escapedHtml.includes("&lt;u&gt;"));
  assert.ok(escapedHtml.includes("&amp;a"));

  const exportedHtml = exportSessionHtml({
    engine,
    sessionStats,
    sessionState: { sessionId: "legacy" },
    sessionSource: "pi",
    projectMarchDir,
    now,
  });
  assert.equal(exportedHtml.turnCount, 2);
  assert.ok(exportedHtml.path.endsWith("2026-05-10T01-02-03-004Z_s_1.html"));
  assert.ok(readFileSync(exportedHtml.path, "utf8").includes("Sprint"));

  const output = await handleExportCommand({ type: "jsonl" }, {
    runner: { engine, getSessionStats: () => sessionStats },
    sessionState: { sessionId: "legacy" },
    sessionSource: "pi",
    projectMarchDir,
    now,
  });
  assert.ok(output[0].includes("Exported JSONL:"));
  assert.ok(output[0].includes("(2 turns)"));
  const htmlOutput = await handleExportCommand({ type: "html" }, {
    runner: { engine, getSessionStats: () => sessionStats },
    sessionState: { sessionId: "legacy" },
    sessionSource: "pi",
    projectMarchDir,
    now,
  });
  assert.ok(htmlOutput[0].includes("Exported HTML:"));
  assert.ok(htmlOutput[0].includes("(2 turns)"));
  await assert.rejects(() => createSessionGist({
    engine,
    sessionStats,
    sessionState: { sessionId: "legacy" },
    sessionSource: "pi",
    now,
    env: {},
    fetchImpl: async () => ({}),
  }), /GITHUB_TOKEN or GH_TOKEN is required/);
  const gistRequests = [];
  const gist = await createSessionGist({
    engine,
    sessionStats,
    sessionState: { sessionId: "legacy" },
    sessionSource: "pi",
    now,
    format: "html",
    env: { GH_TOKEN: "secret", GITHUB_API_URL: "https://api.test" },
    fetchImpl: async (url, request) => {
      gistRequests.push({ url, request });
      return { ok: true, json: async () => ({ html_url: "https://gist.github.com/example" }) };
    },
  });
  assert.equal(gist.url, "https://gist.github.com/example");
  assert.equal(gist.filename, "2026-05-10T01-02-03-004Z_s_1.html");
  assert.equal(gistRequests[0].url, "https://api.test/gists");
  assert.equal(gistRequests[0].request.method, "POST");
  assert.equal(gistRequests[0].request.headers.Authorization, "Bearer secret");
  const gistPayload = JSON.parse(gistRequests[0].request.body);
  assert.equal(gistPayload.public, false);
  assert.ok(gistPayload.files["2026-05-10T01-02-03-004Z_s_1.html"].content.includes("<!doctype html>"));
  const gistOutput = await handleExportCommand({ type: "gist", format: "jsonl" }, {
    runner: { engine, getSessionStats: () => sessionStats },
    sessionState: { sessionId: "legacy" },
    sessionSource: "pi",
    now,
    env: { GITHUB_TOKEN: "secret" },
    fetchImpl: async () => ({ ok: true, json: async () => ({ html_url: "https://gist.github.com/jsonl" }) }),
  });
  assert.deepEqual(gistOutput, ["Created Gist: https://gist.github.com/jsonl"]);

  cleanup(dir);
  console.log("  PASS");
}
