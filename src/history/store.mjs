import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename, join } from "node:path";
import { searchMarkdownRoot } from "../memory/search.mjs";
import { getTurnAssistantContent, getTurnStartRecallHints, getTurnToolCalls, getTurnUserContent } from "../session/turn-record.mjs";

const DEFAULT_HISTORY_LIMIT = 20;
const MAX_HISTORY_LIMIT = 50;

export class HistoryStore {
  constructor({ root, cwd, now = () => new Date() } = {}) {
    if (!root) throw new Error("history root is required");
    this.root = root;
    this.cwd = cwd;
    this.now = now;
  }

  appendTurn({ turn, sessionStats = {}, runtime = {} } = {}) {
    if (!turn) return null;
    const sessionId = sanitizeId(sessionStats.sessionId ?? sessionStats.sessionFile ?? "session");
    const filePath = join(this.#projectDir(), `${sessionId}.md`);
    mkdirSync(this.#projectDir(), { recursive: true });
    if (!existsSync(filePath)) writeFileSync(filePath, this.#fileHeader({ sessionId, sessionStats }), "utf8");
    appendFileSync(filePath, this.#formatTurn({ turn, sessionId, sessionStats, runtime }), "utf8");
    return filePath;
  }

  searchRipgrep(query, { allProjects = false, sessionId = null, limit = DEFAULT_HISTORY_LIMIT, context = 2, syntax = "regex", case: caseMode = "smart" } = {}) {
    const root = allProjects ? this.root : this.#projectDir();
    const glob = sessionId ? [`**/${sanitizeId(sessionId)}.md`] : [];
    return searchMarkdownRoot({
      root,
      query,
      limit: clampInt(limit, 1, MAX_HISTORY_LIMIT, DEFAULT_HISTORY_LIMIT),
      context,
      syntax,
      caseMode,
      glob,
    });
  }

  #projectDir() {
    return join(this.root, "projects", cwdHash(this.cwd));
  }

  #fileHeader({ sessionId, sessionStats }) {
    return [
      `# March History · ${sessionId}`,
      "",
      `- cwd: ${this.cwd}`,
      `- project: ${basename(this.cwd) || this.cwd}`,
      sessionStats.sessionFile ? `- session_file: ${sessionStats.sessionFile}` : null,
      "",
    ].filter(Boolean).join("\n");
  }

  #formatTurn({ turn, sessionId, sessionStats, runtime }) {
    const now = this.now().toISOString();
    return [
      `\n## Turn ${turn.index ?? "?"} · ${now}`,
      "",
      "metadata:",
      `- session: ${sessionId}`,
      `- cwd: ${this.cwd}`,
      runtime.provider ? `- provider: ${runtime.provider}` : null,
      runtime.modelId ? `- model: ${runtime.modelId}` : null,
      sessionStats.sessionName ? `- session_name: ${sessionStats.sessionName}` : null,
      "",
      "### User",
      safeBlock(getTurnUserContent(turn)),
      formatRecallSection("User memory recall", getTurnStartRecallHints(turn)),
      "### Assistant",
      safeBlock(getTurnAssistantContent(turn)),
      turn.thinking ? ["### Thinking", safeBlock(turn.thinking)].join("\n") : null,
      "### Tool calls",
      formatToolCalls(getTurnToolCalls(turn)),
      "",
    ].filter(Boolean).join("\n");
  }
}

function formatToolCalls(calls = []) {
  if (!Array.isArray(calls) || calls.length === 0) return "(none)";
  return calls.map((call) => {
    const lines = [`- ${call.name ?? "unknown"} status=${call.status ?? "unknown"}`];
    const args = JSON.stringify(call.args ?? null);
    if (args && args !== "null") lines.push(`  args: ${args}`);
    if (call.status === "failed") {
      lines.push("  error:");
      if (call.error?.message) lines.push(`  message: ${escapeSingleLine(call.error.message)}`);
      if (call.error?.details) lines.push(`  details: ${JSON.stringify(call.error.details)}`);
      if (call.error?.excerpt) lines.push("  excerpt:", fence(call.error.excerpt));
    }
    return lines.join("\n");
  }).join("\n");
}

function formatRecallSection(title, hints = []) {
  if (!Array.isArray(hints) || hints.length === 0) return null;
  return [`### ${title}`, ...hints.map((hint) => `- ${hint.id ?? "unknown"} | ${hint.name ?? hint.title ?? ""} | ${hint.description ?? ""}`)].join("\n");
}

function safeBlock(value) {
  const text = String(value ?? "").trim();
  return text || "(empty)";
}

function fence(value) {
  return "  ```text\n" + String(value ?? "").trimEnd() + "\n  ```";
}

function sanitizeId(value) {
  const raw = String(value ?? "session").trim() || "session";
  return raw.replace(/[^a-zA-Z0-9_.-]+/g, "_").slice(0, 120) || "session";
}

function cwdHash(cwd) {
  return createHash("sha1").update(String(cwd ?? "")).digest("hex").slice(0, 16);
}

function escapeSingleLine(value) {
  return JSON.stringify(String(value ?? "").replace(/\s+/g, " "));
}

function clampInt(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(number)));
}
