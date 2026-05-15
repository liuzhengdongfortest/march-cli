import { spawnSync } from "node:child_process";
import { MODES, formatModeLabel } from "../input/mode-state.mjs";
import { accent, text, PREFIX, R } from "../tui/ui-theme.mjs";

export function statusCommand({
  runner,
  sessionState,
  sessionSource = "legacy",
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
  sessionSource = "legacy",
  extensionDiagnostics = [],
  lifecycleState = null,
  gitBranch = getGitBranch(runner.engine.cwd),
  mode = MODES.DO,
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
  });
}

export function formatStatusLine({
  engine,
  sessionState,
  sessionStats = null,
  sessionSource = "legacy",
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
    `open:${engine.openFiles?.size ?? 0}`,
    `pins:${engine.getPins?.().length ?? engine.pins?.size ?? 0}`,
  );
  return parts.join("  ");
}

export function formatStatusBarLine({
  engine,
  mode = MODES.DO,
}) {
  const model = engine.modelId || "model?";
  const thinking = engine.thinkingLevel || "thinking?";

  const C = PREFIX; // foreground-only color prefixes (no reset)
  const DIM = C.brightBlack;
  const OK = "\x1b[32m";  // green, no reset
  const WARN = "\x1b[33m"; // yellow, no reset
  const modeSegment = `${mode === MODES.DISCUSS ? WARN : OK}${formatModeLabel(mode)}`;
  const runtime = `${C.cyan}${model}${DIM}·${thinking}`;

  const inner = [modeSegment, runtime].join(` ${DIM}|${C.fg250} `);
  return `${inner}${R}`;
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
