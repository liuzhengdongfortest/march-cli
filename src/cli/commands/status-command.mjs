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
  return [
    formatStatusLine({
      engine: runner.engine,
      sessionState,
      sessionStats: runner.getSessionStats?.() ?? null,
      sessionSource,
      extensionDiagnostics,
      lifecycleState,
      gitBranch,
      providerQuota,
    }),
    ...formatProviderQuotaLines(providerQuota),
  ];
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
    providerQuota: runner.getCachedProviderQuotaSnapshot?.() ?? null,
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
  providerQuota = null,
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
  const remoteMemories = engine.remoteMemorySources ?? [];
  if (remoteMemories.length > 0) parts.push(`remote-memory:${remoteMemories.map((source) => source.name).join(",")}`);
  parts.push(
    `model:${engine.modelId}`,
    `provider:${engine.provider}`,
    `thinking:${engine.thinkingLevel ?? "unknown"}`,
    `tokens:${tokens}`,
    `ext:${formatExtensionDiagnosticSummary(extensionDiagnostics, lifecycleState)}`,
  );
  const quota = formatProviderQuotaSegment(providerQuota);
  if (quota) parts.push(quota);
  return parts.join("  ");
}

export function formatProviderQuotaSegment(providerQuota) {
  const windows = providerQuota?.limits?.flatMap((limit) => limit.windows ?? []) ?? [];
  if (windows.length === 0) return "";
  const visible = windows.slice(0, 2).map((window) => `${window.label}:${formatPercent(window.remainingPercent)}%left`);
  return `quota:${visible.join(",")}`;
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
  return `resets ${date.toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })}`;
}

export function formatStatusBarLine({
  engine,
  mode = MODES.DO,
  contextTokens = null,
  activity = null,
  lspStatus = null,
  providerQuota = null,
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
  const compactQuota = formatCompactProviderQuota(providerQuota);
  if (compactQuota) segments.push(`${C.fg250}${compactQuota}`);
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

export function formatCompactProviderQuota(providerQuota) {
  const windows = providerQuota?.limits?.flatMap((limit) => limit.windows ?? []) ?? [];
  const firstWindow = windows[0];
  if (!firstWindow) return "";
  return `quota ${firstWindow.label} ${formatPercent(firstWindow.remainingPercent)}% left`;
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

function formatPercent(value) {
  return Math.round(Math.max(0, Math.min(100, Number(value) || 0)));
}
