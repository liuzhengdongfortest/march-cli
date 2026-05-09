import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function parseExportCommand(input) {
  if (input !== "/export" && !input.startsWith("/export ")) return { type: "none" };
  const args = input.slice("/export".length).trim().split(/\s+/).filter(Boolean);
  if (args.length === 0) return { type: "error", message: "usage: /export jsonl|html" };
  if (args.length > 1) return { type: "error", message: "usage: /export jsonl|html" };
  if (args[0] !== "jsonl" && args[0] !== "html") return { type: "error", message: `unsupported export format: ${args[0]}` };
  return { type: args[0] };
}

export function handleExportCommand(command, { runner, sessionState, sessionSource, projectMarchDir, now = new Date() }) {
  if (command.type === "error") return [`Error: ${command.message}`];
  if (command.type !== "jsonl" && command.type !== "html") return [];

  const options = {
    engine: runner.engine,
    sessionStats: runner.getSessionStats?.(),
    sessionState,
    sessionSource,
    projectMarchDir,
    now,
  };
  const result = command.type === "jsonl"
    ? exportSessionJsonl(options)
    : exportSessionHtml(options);
  return [`Exported ${command.type.toUpperCase()}: ${result.path} (${result.turnCount} turns)`];
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

export function exportSessionHtml({ engine, sessionStats, sessionState, sessionSource = "legacy", projectMarchDir, now = new Date() }) {
  const exportDir = join(projectMarchDir ?? join(engine.cwd, ".march"), "exports");
  mkdirSync(exportDir, { recursive: true });
  const sessionId = sessionStats?.sessionId ?? sessionState?.sessionId ?? "session";
  const filename = `${formatTimestamp(now)}_${sanitizeFilename(sessionId)}.html`;
  const path = join(exportDir, filename);
  const records = buildSessionJsonlRecords({ engine, sessionStats, sessionState, sessionSource, now });
  writeFileSync(path, buildSessionHtml(records), "utf8");
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

export function buildSessionHtml(records) {
  const session = records.find((record) => record.type === "session") ?? {};
  const compaction = records.find((record) => record.type === "compaction");
  const turns = records.filter((record) => record.type === "turn");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(session.sessionName || session.sessionId || "March session")}</title>
  <style>
    :root { color-scheme: light dark; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; padding: 32px; line-height: 1.5; background: Canvas; color: CanvasText; }
    main { max-width: 920px; margin: 0 auto; }
    h1 { font-size: 28px; margin: 0 0 8px; }
    .meta { color: color-mix(in srgb, CanvasText 65%, Canvas); margin-bottom: 24px; }
    .turn { border-top: 1px solid color-mix(in srgb, CanvasText 20%, Canvas); padding: 20px 0; }
    .label { font-weight: 700; margin: 16px 0 6px; }
    pre { white-space: pre-wrap; word-wrap: break-word; margin: 0; padding: 12px; border-radius: 8px; background: color-mix(in srgb, CanvasText 8%, Canvas); }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(session.sessionName || "March session")}</h1>
    <div class="meta">${escapeHtml(formatSessionMeta(session))}</div>
    ${compaction ? `<section class="turn"><div class="label">Compacted history</div><pre>${escapeHtml(compaction.summary)}</pre></section>` : ""}
    ${turns.map(formatTurnHtml).join("\n")}
  </main>
</body>
</html>
`;
}

function formatTurnHtml(turn) {
  return `<section class="turn">
  <h2>Turn ${escapeHtml(String(turn.index))}</h2>
  <div class="label">User</div>
  <pre>${escapeHtml(turn.userMessage)}</pre>
  <div class="label">Summary</div>
  <pre>${escapeHtml(turn.summary || "(no summary)")}</pre>
  <div class="label">Assistant</div>
  <pre>${escapeHtml(turn.assistantMessage || "(no assistant message)")}</pre>
</section>`;
}

function formatSessionMeta(session) {
  return [
    session.sessionId ? `session ${session.sessionId}` : null,
    session.source ? `source ${session.source}` : null,
    session.provider && session.modelId ? `${session.provider}/${session.modelId}` : null,
    session.thinkingLevel ? `thinking ${session.thinkingLevel}` : null,
    session.exportedAt ? `exported ${session.exportedAt}` : null,
  ].filter(Boolean).join(" | ");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatTimestamp(date) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function sanitizeFilename(value) {
  return String(value || "session").replace(/[^a-zA-Z0-9._-]/g, "_");
}
