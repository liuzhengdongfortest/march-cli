import { spawnSync } from "node:child_process";

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
}) {
  return formatStatusBarLine({
    engine: runner.engine,
    sessionState,
    sessionStats: runner.getSessionStats?.() ?? null,
    sessionSource,
    extensionDiagnostics,
    lifecycleState,
    gitBranch,
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
  sessionState,
  sessionStats = null,
  sessionSource = "legacy",
  extensionDiagnostics = [],
  lifecycleState = null,
  gitBranch = null,
}) {
  const statsSessionId = sessionStats?.sessionId ?? sessionState?.sessionId ?? "unknown";
  const session = shortSessionId(statsSessionId);
  const model = engine.modelId || "model?";
  const provider = engine.provider || "provider?";
  const thinking = engine.thinkingLevel ? `think:${engine.thinkingLevel}` : null;
  const tokenText = formatTokenSummary(sessionStats?.tokens);
  const ext = formatExtensionDiagnosticSummary(extensionDiagnostics, lifecycleState);
  const open = engine.openFiles?.size ?? 0;
  const pins = engine.getPins?.().length ?? engine.pins?.size ?? 0;

  const left = [
    gitBranch ? `git:${gitBranch}` : null,
    engine.sessionName ? engine.sessionName : null,
    `${model}/${provider}`,
  ].filter(Boolean);

  const right = [
    thinking,
    tokenText,
    ext === "ok" ? null : `ext:${ext}`,
    open > 0 ? `open:${open}` : null,
    pins > 0 ? `pins:${pins}` : null,
    `${sessionSource}:${session}`,
  ].filter(Boolean);

  return `${left.join("  ")}${right.length ? `    ${right.join("  ")}` : ""}`;
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

function formatTokenSummary(tokens) {
  if (!tokens) return null;
  const input = tokens.input ?? 0;
  const output = tokens.output ?? 0;
  if (input === 0 && output === 0) return null;
  return `${compactNumber(input)}in/${compactNumber(output)}out`;
}

function compactNumber(value) {
  const number = Number(value) || 0;
  if (Math.abs(number) >= 1000000) return `${(number / 1000000).toFixed(1).replace(/\.0$/, "")}m`;
  if (Math.abs(number) >= 1000) return `${(number / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(number);
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
