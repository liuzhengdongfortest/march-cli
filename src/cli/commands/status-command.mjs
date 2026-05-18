import { spawnSync } from "node:child_process";
import { MODES, formatModeLabel } from "../input/mode-state.mjs";
import { accent, text, PREFIX, R } from "../tui/ui-theme.mjs";

export function statusCommand({
  runner,
  sessionState,
  sessionSource = "pi",
  extensionDiagnostics = [],
  lifecycleState = null,
  gitBranch = getGitBranch(runner.engine.cwd),
}) {
  return [formatStatusLine({
    engine: runner.engine,
    sessionState,
    sessionStats: runner.getSessionStats?.() ?? null,
    sessionSource,
    extensionDiagnostics,
    lifecycleState,
    gitBranch,
  })];
}

export function statusBarLine({
  runner,
  sessionState,
  sessionSource = "pi",
  extensionDiagnostics = [],
  lifecycleState = null,
  gitBranch = getGitBranch(runner.engine.cwd),
  mode = MODES.DO,
  contextTokens = null,
  activity = null,
  lspStatus = null,
}) {
  return formatStatusBarLine({
    engine: runner.engine,
    sessionState,
    sessionStats: runner.getSessionStats?.() ?? null,
    sessionSource,
    extensionDiagnostics,
    lifecycleState,
    gitBranch,
    mode,
    contextTokens,
    activity,
    lspStatus,
  });
}

export function formatStatusLine({
  engine,
  sessionState,
  sessionStats = null,
  sessionSource = "pi",
  extensionDiagnostics = [],
  lifecycleState = null,
  gitBranch = null,
}) {
  const statsSessionId = sessionStats?.sessionId ?? sessionState?.sessionId ?? "unknown";
  const tokens = sessionStats?.tokens
    ? `${sessionStats.tokens.input ?? 0}in/${sessionStats.tokens.output ?? 0}out`
    : "n/a";
  const parts = [
    `git:${gitBranch || "none"}`,
    `session:${statsSessionId}`,
    `source:${sessionSource}`,
  ];
  if (engine.sessionName) parts.push(`name:${engine.sessionName}`);
  parts.push(
    `model:${engine.modelId}`,
    `provider:${engine.provider}`,
    `thinking:${engine.thinkingLevel ?? "unknown"}`,
    `tokens:${tokens}`,
    `ext:${formatExtensionDiagnosticSummary(extensionDiagnostics, lifecycleState)}`,
  );
  return parts.join("  ");
}

export function formatStatusBarLine({
  engine,
  mode = MODES.DO,
  contextTokens = null,
  activity = null,
  lspStatus = null,
}) {
  const model = engine.modelId || "model?";
  const thinking = engine.thinkingLevel || "thinking?";

  const C = PREFIX; // foreground-only color prefixes (no reset)
  const DIM = C.brightBlack;
  const OK = "\x1b[32m";  // green, no reset
  const WARN = "\x1b[33m"; // yellow, no reset
  const modeSegment = `${mode === MODES.DISCUSS ? WARN : OK}${formatModeLabel(mode)}`;
  const runtime = `${C.cyan}${model}${DIM}·${thinking}`;
  const segments = [modeSegment, runtime];
  const lspText = formatLspSegment(lspStatus);
  if (lspText) segments.push(`${C.fg250}${lspText}`);
  const activityText = formatActivitySegment(activity);
  if (activityText) segments.push(`${C.fg250}${activityText}`);
  const compactTokens = formatCompactTokenCount(contextTokens);
  if (compactTokens) segments.push(`${C.fg250}${compactTokens}`);

  const inner = segments.join(` ${DIM}|${C.fg250} `);
  return `${inner}${R}`;
}

export function formatLspSegment(lspStatus) {
  if (!lspStatus) return "";
  const servers = lspStatus.servers ?? [];
  const visible = servers.filter((server) => server.id);
  if (visible.length === 0) return "lsp:off";
  if (servers.some((server) => server.status === "failed")) return "lsp:failed";
  if (servers.some((server) => server.status === "starting")) return "lsp:starting";
  if (servers.every((server) => server.status === "unavailable")) return "lsp:off";
  const active = visible.filter((server) => server.status !== "unavailable");
  if (active.length === 0) return "lsp:off";
  const ids = [...new Set(active.map((server) => shortLspId(server.id)))].join(",");
  return `lsp:${ids}✓`;
}

function formatActivitySegment(activity) {
  if (!activity) return "";
  const label = String(activity.label ?? "").trim();
  const frame = String(activity.frame ?? "").trim();
  return [frame, label].filter(Boolean).join(" ");
}

function shortLspId(id) {
  if (id === "typescript") return "ts";
  return String(id ?? "?");
}

export function formatCompactTokenCount(tokens) {
  const value = Number(tokens);
  if (!Number.isFinite(value) || value <= 0) return "";
  if (value < 1000) return String(Math.ceil(value));
  if (value < 1000000) return `${formatOneDecimal(value / 1000)}K`;
  return `${formatOneDecimal(value / 1000000)}M`;
}

export function formatExtensionDiagnosticSummary(extensionDiagnostics = [], lifecycleState = null) {
  const diagnostics = [...extensionDiagnostics, ...(lifecycleState?.diagnostics ?? [])];
  if (diagnostics.length === 0) return "ok";
  const counts = new Map();
  for (const diagnostic of diagnostics) {
    const type = diagnostic?.type ?? "info";
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([type, count]) => `${count}${type}`)
    .join(",");
}

export function getGitBranch(cwd) {
  const branch = runGit(cwd, ["branch", "--show-current"]);
  if (branch) return branch;
  return runGit(cwd, ["rev-parse", "--short", "HEAD"]);
}

export function shortSessionId(sessionId) {
  const value = String(sessionId || "unknown");
  if (value === "unknown" || value.length <= 8) return value;
  return value.slice(0, 8);
}

function runGit(cwd, args) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0) return null;
  return result.stdout.trim() || null;
}

function formatOneDecimal(value) {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}
