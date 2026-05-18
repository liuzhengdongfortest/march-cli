const MAX_DIAGNOSTICS = 20;

export function formatLspDiagnostics({ snapshot } = {}) {
  const diagnostics = snapshot?.diagnostics ?? [];
  if (diagnostics.length === 0) return "[diagnostics]";

  const sorted = [...diagnostics].sort((a, b) => severityRank(a.severity) - severityRank(b.severity));

  const counts = countSeverities(diagnostics);
  const lines = ["[diagnostics]", "source: lsp"];
  if (snapshot?.status) lines.push(`status: ${snapshot.status}`);
  lines.push(`summary: ${formatSummary(counts)}${diagnostics.length > MAX_DIAGNOSTICS ? `, showing ${MAX_DIAGNOSTICS} of ${diagnostics.length}` : ""}`);
  lines.push("");
  for (const diagnostic of sorted.slice(0, MAX_DIAGNOSTICS)) {
    lines.push(formatDiagnostic(diagnostic));
  }
  return lines.join("\n");
}

export function formatLspDiagnosticsForPath({ snapshot, path } = {}) {
  const targetPath = String(path ?? "");
  if (!targetPath) return "";
  const diagnostics = (snapshot?.diagnostics ?? []).filter((diagnostic) => diagnostic.path === targetPath);
  if (diagnostics.length === 0) return "";
  return formatLspDiagnostics({
    snapshot: {
      ...snapshot,
      diagnostics,
    },
  });
}

function formatDiagnostic(diagnostic) {
  const severity = formatSeverity(diagnostic.severity);
  const line = (diagnostic.range?.start?.line ?? 0) + 1;
  const col = (diagnostic.range?.start?.character ?? 0) + 1;
  const code = diagnostic.code == null ? "" : ` ${diagnostic.code}`;
  const source = diagnostic.source ?? diagnostic.serverId ?? "lsp";
  return `- ${severity} ${source} ${diagnostic.path}:${line}:${col}${code}\n  ${singleLine(diagnostic.message ?? "")}`;
}

function countSeverities(diagnostics) {
  const counts = { error: 0, warning: 0, info: 0, hint: 0 };
  for (const diagnostic of diagnostics) counts[formatSeverity(diagnostic.severity)]++;
  return counts;
}

function formatSummary(counts) {
  return [
    [counts.error, "errors"],
    [counts.warning, "warnings"],
    [counts.info, "info"],
    [counts.hint, "hints"],
  ].filter(([count]) => count > 0).map(([count, label]) => `${count} ${label}`).join(", ") || "0 diagnostics";
}

function formatSeverity(severity) {
  if (severity === 2) return "warning";
  if (severity === 3) return "info";
  if (severity === 4) return "hint";
  return "error";
}

function severityRank(severity) {
  return { error: 0, warning: 1, info: 2, hint: 3 }[formatSeverity(severity)] ?? 4;
}

function singleLine(text) {
  return String(text).replace(/\s+/g, " ").trim();
}
