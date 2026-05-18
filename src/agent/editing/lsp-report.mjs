import { formatLspDiagnosticsForPath } from "../../lsp/diagnostics-format.mjs";
import { sameLspPath } from "../../lsp/path-match.mjs";

export async function waitForLspReport({ lspService, path, lspResult, since = Date.now(), timeoutMs = 3000, intervalMs = 150 }) {
  const immediate = formatLspResultMessage(lspResult);
  if (!lspService?.snapshot || !path || lspResult?.status === "unsupported") return immediate;
  if (lspResult?.status === "unavailable" || lspResult?.status === "failed") return immediate;

  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const snapshot = lspService.snapshot();
    const diagnostics = formatCurrentLspDiagnosticsForPath({ snapshot, path, since });
    if (diagnostics) return diagnostics;
    if (hasCurrentDiagnosticPublish({ snapshot, path, since })) return formatNoLspDiagnostics({ snapshot });

    const remaining = deadline - Date.now();
    if (remaining <= 0) return formatLatestLspMessage({ snapshot, lspResult });
    await sleep(Math.min(intervalMs, remaining));
  }
}

function formatLspResultMessage(result, { timedOut = false } = {}) {
  if (!result || result.status === "unsupported") return "";
  if (result.status === "unavailable" || result.status === "failed") {
    return `<lsp status="${result.status}" server="${result.id ?? "unknown"}">${result.reason ?? "unavailable"}</lsp>`;
  }
  if (result.status === "starting") {
    const detail = timedOut ? "diagnostics still pending; server continues in background" : "diagnostics pending";
    return `<lsp status="starting" server="${result.id}">${detail}</lsp>`;
  }
  return "";
}

function formatCurrentLspDiagnosticsForPath({ snapshot, path, since }) {
  const diagnostics = formatLspDiagnosticsForPath({ snapshot, path });
  if (!diagnostics) return "";
  if (!Array.isArray(snapshot?.files)) return diagnostics;
  return hasCurrentDiagnosticPublish({ snapshot, path, since }) ? diagnostics : "";
}

function hasCurrentDiagnosticPublish({ snapshot, path, since }) {
  return (snapshot?.files ?? []).some((file) => sameLspPath(file.path, path) && (file.updatedAt ?? 0) >= since);
}

function formatNoLspDiagnostics({ snapshot }) {
  const lines = ["[diagnostics]", "source: lsp"];
  if (snapshot?.status) lines.push(`status: ${snapshot.status}`);
  lines.push("summary: 0 diagnostics");
  return lines.join("\n");
}

function formatLatestLspMessage({ snapshot, lspResult }) {
  const server = latestServerForResult(snapshot, lspResult);
  if (server?.status === "failed" || server?.status === "unavailable") {
    return formatLspResultMessage({ ...lspResult, ...server });
  }
  if (server?.status === "idle" || server?.status === "ready") return formatNoLspDiagnostics({ snapshot });
  return formatLspResultMessage(lspResult, { timedOut: lspResult?.status === "starting" });
}

function latestServerForResult(snapshot, lspResult) {
  const servers = snapshot?.servers ?? [];
  return servers.find((server) => server.id === lspResult?.id && server.root === lspResult?.root)
    ?? servers.find((server) => server.id === lspResult?.id);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
