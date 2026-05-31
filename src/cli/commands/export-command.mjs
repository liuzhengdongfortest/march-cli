import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getTurnAssistantContent, getTurnUserContent } from "../../session/turn-record.mjs";

export function parseExportCommand(input) {
  if (input !== "/export" && !input.startsWith("/export ")) return { type: "none" };
  const args = input.slice("/export".length).trim().split(/\s+/).filter(Boolean);
  if (args.length === 0) return { type: "error", message: "usage: /export jsonl|html|gist <jsonl|html>" };
  if (args[0] === "gist") {
    if (args.length !== 2) return { type: "error", message: "usage: /export gist <jsonl|html>" };
    if (args[1] !== "jsonl" && args[1] !== "html") return { type: "error", message: `unsupported gist export format: ${args[1]}` };
    return { type: "gist", format: args[1] };
  }
  if (args.length > 1) return { type: "error", message: "usage: /export jsonl|html|gist <jsonl|html>" };
  if (args[0] !== "jsonl" && args[0] !== "html") return { type: "error", message: `unsupported export format: ${args[0]}` };
  return { type: args[0] };
}

export async function handleExportCommand(command, { runner, sessionState, sessionSource = "pi", projectMarchDir, now = new Date(), env = process.env, fetchImpl = globalThis.fetch } = {}) {
  if (command.type === "error") return [`Error: ${command.message}`];
  if (command.type !== "jsonl" && command.type !== "html" && command.type !== "gist") return [];

  const options = {
    engine: runner.engine,
    sessionStats: runner.getSessionStats?.(),
    sessionState,
    sessionSource,
    projectMarchDir,
    now,
  };
  if (command.type === "gist") {
    try {
      const result = await createSessionGist({ ...options, format: command.format, env, fetchImpl });
      return [`Created Gist: ${result.url}`];
    } catch (err) {
      return [`Error: ${err.message}`];
    }
  }
  const result = command.type === "jsonl"
    ? exportSessionJsonl(options)
    : exportSessionHtml(options);
  return [`Exported ${command.type.toUpperCase()}: ${result.path} (${result.turnCount} turns)`];
}

export function exportSessionJsonl({ engine, sessionStats, sessionState, sessionSource = "pi", projectMarchDir, now = new Date() }) {
  const exportDir = join(projectMarchDir ?? join(engine.cwd, ".march"), "exports");
  mkdirSync(exportDir, { recursive: true });
  const sessionId = sessionStats?.sessionId ?? sessionState?.sessionId ?? "session";
  const filename = `${formatTimestamp(now)}_${sanitizeFilename(sessionId)}.jsonl`;
  const path = join(exportDir, filename);
  const records = buildSessionJsonlRecords({ engine, sessionStats, sessionState, sessionSource, now });
  writeFileSync(path, records.map((record) => JSON.stringify(record)).join("\n") + "\n", "utf8");
  return { path, turnCount: engine.turns.length };
}

export function exportSessionHtml({ engine, sessionStats, sessionState, sessionSource = "pi", projectMarchDir, now = new Date() }) {
  const exportDir = join(projectMarchDir ?? join(engine.cwd, ".march"), "exports");
  mkdirSync(exportDir, { recursive: true });
  const sessionId = sessionStats?.sessionId ?? sessionState?.sessionId ?? "session";
  const filename = `${formatTimestamp(now)}_${sanitizeFilename(sessionId)}.html`;
  const path = join(exportDir, filename);
  const records = buildSessionJsonlRecords({ engine, sessionStats, sessionState, sessionSource, now });
  writeFileSync(path, buildSessionHtml(records), "utf8");
  return { path, turnCount: engine.turns.length };
}

export async function createSessionGist({ engine, sessionStats, sessionState, sessionSource = "pi", now = new Date(), format = "html", env = process.env, fetchImpl = globalThis.fetch }) {
  const token = env.GITHUB_TOKEN || env.GH_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN or GH_TOKEN is required for /export gist");
  if (typeof fetchImpl !== "function") throw new Error("fetch is not available for /export gist");

  const records = buildSessionJsonlRecords({ engine, sessionStats, sessionState, sessionSource, now });
  const session = records.find((record) => record.type === "session") ?? {};
  const sessionId = session.sessionId ?? "session";
  const extension = format === "html" ? "html" : "jsonl";
  const filename = `${formatTimestamp(now)}_${sanitizeFilename(sessionId)}.${extension}`;
  const content = format === "html"
    ? buildSessionHtml(records)
    : records.map((record) => JSON.stringify(record)).join("\n") + "\n";
  const response = await fetchImpl(`${env.GITHUB_API_URL || "https://api.github.com"}/gists`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      "User-Agent": "march-cli",
    },
    body: JSON.stringify({
      description: `March session export: ${session.sessionName || sessionId}`,
      public: false,
      files: {
        [filename]: { content },
      },
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`GitHub Gist create failed (${response.status}): ${body.message || response.statusText || "unknown error"}`);
  }
  if (!body.html_url) throw new Error("GitHub Gist create response did not include html_url");
  return { url: body.html_url, filename };
}

export function buildSessionJsonlRecords({ engine, sessionStats, sessionState, sessionSource = "pi", now = new Date() }) {
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

  for (const turn of engine.turns) {
    records.push({
      type: "turn",
      index: turn.index,
      userMessage: getTurnUserContent(turn),
      assistantMessage: getTurnAssistantContent(turn),
    });
  }

  return records;
}

export function buildSessionHtml(records) {
  const session = records.find((record) => record.type === "session") ?? {};
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
