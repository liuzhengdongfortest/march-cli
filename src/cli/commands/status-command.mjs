import { spawnSync } from "node:child_process";
import { MODES, formatModeLabel } from "../input/mode-state.mjs";
import { modeLabel, PREFIX, R } from "../tui/ui-theme.mjs";

export function statusCommand({
  runner,
  sessionState,
  sessionSource = "pi",
  extensionDiagnostics = [],
  lifecycleState = null,
  gitBranch = getGitBranch(runner.engine.cwd),
}) {
  const providerQuota = runner.getCachedProviderQuotaSnapshot?.() ?? null;
  const lines = [
    ...formatStatusLines({
      engine: runner.engine,
      sessionState,
      sessionStats: runner.getSessionStats?.() ?? null,
      sessionSource,
      extensionDiagnostics,
      lifecycleState,
      gitBranch,
    }),
    ...formatProviderQuotaLines(providerQuota),
  ];
  return lines.length > 0 ? lines : ["No provider quota available."];
}

export function statusBarLine({
  runner,
  mode = MODES.DO,
  contextTokens = null,
  activity = null,
  lspStatus = null,
}) {
  return formatStatusBarLine({
    engine: runner.engine,
    mode,
    contextTokens,
    activity,
    lspStatus,
  });
}

export function formatStatusLine(options) {
  return formatStatusLines(options).join("  ");
}

export function formatStatusLines({
  extensionDiagnostics = [],
  lifecycleState = null,
}) {
  const diagnosticSummary = formatExtensionDiagnosticSummary(extensionDiagnostics, lifecycleState);
  return shouldShowDiagnostics(diagnosticSummary) ? [`Extensions: ${diagnosticSummary}`] : [];
}

export function formatProviderQuotaLines(providerQuota, { width = 20 } = {}) {
  const windows = providerQuota?.limits?.flatMap((limit) => limit.windows ?? []) ?? [];
  return windows.slice(0, 2).map((window) => formatProviderQuotaLine(window, { width }));
}

export function formatProviderQuotaLine(window, { width = 20 } = {}) {
  const label = window.label === "weekly" ? "Weekly limit:" : `${window.label} limit:`;
  const left = formatPercent(window.remainingPercent);
  return `${label.padEnd(28)} ${formatQuotaBar(window.remainingPercent, width)} ${left}% left (${formatQuotaReset(window.resetsAt)})`;
}

export function formatQuotaBar(percent, width = 20) {
  const value = Math.max(0, Math.min(100, Number(percent) || 0));
  const filled = Math.round((value / 100) * width);
  return `[${"█".repeat(filled)}${"░".repeat(width - filled)}]`;
}

export function formatQuotaReset(resetsAt) {
  if (!resetsAt) return "reset unknown";
  const date = new Date(resetsAt);
  if (Number.isNaN(date.getTime())) return "reset unknown";
  return `resets ${formatResetDate(date)}`;
}

function formatResetDate(date) {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const day = date.getDate();
  const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][date.getMonth()];
  return `${hours}:${minutes} on ${day} ${month}`;
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
  const modeSegment = formatModeSegment(mode);
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

function formatModeSegment(mode) {
  const label = formatModeLabel(mode);
  return (modeLabel[mode] ?? modeLabel.fallback)(label);
}

export function formatLspSegment(lspStatus) {
  if (!lspStatus) return "";
  const servers = lspStatus.servers ?? [];
  const visible = servers.filter((server) => server.id);
  if (visible.length === 0) return "lsp:off";
  const parts = buildLspStatusParts(visible);
  if (parts.length === 0) return "lsp:off";
  return `lsp:${parts.join(",")}`;
}

function buildLspStatusParts(servers) {
  const byId = new Map();
  for (const server of servers) {
    const id = shortLspId(server.id);
    byId.set(id, mergeLspStatus(byId.get(id), server.status));
  }
  return [...byId.entries()]
    .map(([id, status]) => `${id}${formatLspStatusMark(status)}`);
}

function mergeLspStatus(current, next) {
  const rank = { failed: 5, installing: 4, starting: 3, busy: 2, ready: 1, idle: 1, unavailable: 0 };
  if (!current) return next ?? "unavailable";
  const currentRank = rank[current] ?? 0;
  const nextRank = rank[next] ?? 0;
  return nextRank > currentRank ? next : current;
}

function formatLspStatusMark(status) {
  if (status === "failed") return "!";
  if (status === "starting" || status === "installing") return "…";
  if (status === "unavailable") return "?";
  return "✓";
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

function shouldShowDiagnostics(summary) {
  return summary !== "ok" && summary.split(",").some((part) => !part.endsWith("info"));
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

function formatPercent(value) {
  return Math.round(Math.max(0, Math.min(100, Number(value) || 0)));
}
