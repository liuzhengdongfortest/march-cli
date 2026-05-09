import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function parseExportCommand(input) {
  if (input !== "/export" && !input.startsWith("/export ")) return { type: "none" };
  const args = input.slice("/export".length).trim().split(/\s+/).filter(Boolean);
  if (args.length === 0) return { type: "error", message: "usage: /export jsonl" };
  if (args.length > 1) return { type: "error", message: "usage: /export jsonl" };
  if (args[0] !== "jsonl") return { type: "error", message: `unsupported export format: ${args[0]}` };
  return { type: "jsonl" };
}

export function handleExportCommand(command, { runner, sessionState, sessionSource, projectMarchDir, now = new Date() }) {
  if (command.type === "error") return [`Error: ${command.message}`];
  if (command.type !== "jsonl") return [];

  const result = exportSessionJsonl({
    engine: runner.engine,
    sessionStats: runner.getSessionStats?.(),
    sessionState,
    sessionSource,
    projectMarchDir,
    now,
  });
  return [`Exported JSONL: ${result.path} (${result.turnCount} turns)`];
}

export function exportSessionJsonl({ engine, sessionStats, sessionState, sessionSource = "legacy", projectMarchDir, now = new Date() }) {
  const exportDir = join(projectMarchDir ?? join(engine.cwd, ".march"), "exports");
  mkdirSync(exportDir, { recursive: true });
  const sessionId = sessionStats?.sessionId ?? sessionState?.sessionId ?? "session";
  const filename = `${formatTimestamp(now)}_${sanitizeFilename(sessionId)}.jsonl`;
  const path = join(exportDir, filename);
  const records = buildSessionJsonlRecords({ engine, sessionStats, sessionState, sessionSource, now });
  writeFileSync(path, records.map((record) => JSON.stringify(record)).join("\n") + "\n", "utf8");
  return { path, turnCount: engine.turns.length };
}

export function buildSessionJsonlRecords({ engine, sessionStats, sessionState, sessionSource = "legacy", now = new Date() }) {
  const sessionId = sessionStats?.sessionId ?? sessionState?.sessionId ?? null;
  const records = [
    {
      type: "session",
      exportedAt: now.toISOString(),
      sessionId,
      sessionName: engine.sessionName || null,
      source: sessionSource,
      cwd: engine.cwd,
      provider: engine.provider,
      modelId: engine.modelId,
      thinkingLevel: engine.thinkingLevel,
      sessionFile: sessionStats?.sessionFile ?? null,
      stats: sessionStats ? {
        userMessages: sessionStats.userMessages,
        assistantMessages: sessionStats.assistantMessages,
        toolCalls: sessionStats.toolCalls,
        totalMessages: sessionStats.totalMessages,
        tokens: sessionStats.tokens,
        cost: sessionStats.cost,
      } : null,
    },
  ];

  if (engine._compactionSummary) {
    records.push({
      type: "compaction",
      summary: engine._compactionSummary,
    });
  }

  for (const turn of engine.turns) {
    records.push({
      type: "turn",
      index: turn.index,
      userMessage: turn.userMessage ?? "",
      summary: turn.summary ?? "",
      assistantMessage: turn.assistantMessage ?? "",
    });
  }

  return records;
}

function formatTimestamp(date) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function sanitizeFilename(value) {
  return String(value || "session").replace(/[^a-zA-Z0-9._-]/g, "_");
}
