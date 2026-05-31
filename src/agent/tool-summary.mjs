export function formatToolStartLine(name, args = {}) {
  if (name === "edit_file") {
    const path = compactPath(args?.path ?? "");
    const editCount = Array.isArray(args?.edits) ? args.edits.length : 0;
    const mode = args?.mode ?? "patch";
    const summary = mode === "patch" ? `${editCount} edit${editCount === 1 ? "" : "s"}` : mode;
    return joinToolParts("◆", name, [path, summary]);
  }
  if (name === "command_exec") return joinToolParts("◆", name, [compactText(args?.command ?? "")]);
  if (name === "terminal_send") return joinToolParts("◆", name, [args?.shell_id, formatTerminalSendAction(args)]);
  if (name?.startsWith?.("terminal_")) return joinToolParts("◆", name, [args?.shell_id, formatTerminalDetails(args)]);
  if (name === "external_web_search") return joinToolParts("◆", name, [quoteCompact(args?.query ?? "")]);
  if (name === "web_fetch") return joinToolParts("◆", name, [compactText(args?.url ?? "")]);
  if (name === "context_stats") return joinToolParts("◆", name, []);
  if (name === "read") {
    const path = compactPath(args?.path ?? args?.filePath ?? "");
    return joinToolParts("→", name, [path, formatReadRange(args)]);
  }
  if (name === "grep") {
    const path = compactPath(args?.path ?? "");
    return joinToolParts("✱", name, [quoteCompact(args?.pattern ?? ""), path]);
  }
  if (name === "glob") {
    const path = compactPath(args?.path ?? "");
    return joinToolParts("✱", name, [quoteCompact(args?.pattern ?? ""), path]);
  }
  if (name === "find") {
    const path = compactPath(args?.path ?? "");
    return joinToolParts("✱", name, [quoteCompact(args?.pattern ?? ""), path]);
  }
  return joinToolParts("◆", name, [formatSmallOptions(args)]);
}

export function formatToolSuccessTitle(name, result) {
  if (name === "memory_open") {
    const title = compactText(extractMemoryOpenName(result));
    return title ? joinToolParts("◆", name, [title]) : "";
  }
  return "";
}

export function formatToolSuccessSummary(name, result, out = "") {
  if (name === "grep") {
    const matches = result?.details?.results?.length ?? countMatchLines(out);
    return `${matches} match${matches === 1 ? "" : "es"}`;
  }
  if (name === "glob") {
    const matches = Array.isArray(result?.details?.matches) ? result.details.matches.length : countNonEmptyLines(out);
    return `${matches} file${matches === 1 ? "" : "s"}`;
  }
  if (name === "find") {
    const matches = result?.details?.count ?? countNonEmptyLines(out);
    return `${matches} file${matches === 1 ? "" : "s"}`;
  }
  if (name === "memory_open") {
    return compactText(extractMemoryOpenName(result) || compactPath(extractMemoryOpenPath(result) ?? ""));
  }
  return "";
}

function extractMemoryOpenName(result) {
  return firstCompactValue([
    result?.details?.entry?.name,
    result?.details?.name,
    result?.details?.memory?.name,
    result?.details?.opened?.entry?.name,
    result?.details?.frontmatter?.name,
    extractMemoryNameFromToolText(extractToolText(result)),
  ]);
}

function extractMemoryOpenPath(result) {
  return firstCompactValue([
    result?.details?.path,
    result?.details?.relativePath,
    result?.details?.memory?.path,
    result?.details?.opened?.path,
  ]);
}

function extractToolText(result) {
  const content = result?.content;
  if (!Array.isArray(content)) return "";
  return content.filter((item) => item?.type === "text").map((item) => item.text ?? "").join("\n");
}

function extractMemoryNameFromToolText(text) {
  const content = String(text ?? "");
  const marker = content.indexOf("\ncontent:\n");
  const memoryText = marker >= 0 ? content.slice(marker + "\ncontent:\n".length) : content;
  if (!memoryText.startsWith("---\n")) return "";
  const end = memoryText.indexOf("\n---", 4);
  if (end < 0) return "";
  const match = memoryText.slice(4, end).match(/^name:\s*(.+)$/m);
  return match ? unquoteSimpleYamlScalar(match[1]) : "";
}

function unquoteSimpleYamlScalar(value) {
  const text = String(value ?? "").trim();
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    return text.slice(1, -1);
  }
  return text;
}

function firstCompactValue(values) {
  for (const value of values) {
    const text = String(value ?? "").replace(/\s+/g, " ").trim();
    if (text) return text;
  }
  return "";
}

function joinToolParts(icon, name, parts) {
  const clean = parts.map((part) => String(part ?? "").trim()).filter(Boolean);
  return `${icon} ${name}${clean.length ? ` · ${clean.join(" · ")}` : ""}`;
}

function formatReadRange(args = {}) {
  if (args.offset == null && args.limit == null) return "";
  if (args.offset != null && args.limit != null) return `lines ${args.offset}-${Number(args.offset) + Number(args.limit) - 1}`;
  if (args.offset != null) return `from line ${args.offset}`;
  return `limit ${args.limit}`;
}

function formatTerminalSendAction(args = {}) {
  const hasText = typeof args.text === "string" && args.text.length > 0;
  const key = args.key ? String(args.key) : "";
  if (hasText && key) return `text+${key}`;
  if (hasText) return args.text.includes("\n") || args.text.includes("\r") ? "text+enter" : "text";
  return key || "send";
}

function formatTerminalDetails(args = {}) {
  const details = [];
  if (args.pattern) details.push(quoteCompact(args.pattern));
  if (args.cols && args.rows) details.push(`${args.cols}x${args.rows}`);
  if (args.command) details.push(compactText(args.command));
  return details.join(" · ");
}

function formatSmallOptions(args = {}) {
  const parts = [];
  for (const [key, value] of Object.entries(args ?? {})) {
    if (value == null || typeof value === "object") continue;
    parts.push(`${key}=${compactText(value)}`);
    if (parts.length >= 2) break;
  }
  return parts.join(", ");
}

function compactPath(path) {
  return String(path ?? "").split(/[/\\]/).filter(Boolean).slice(-4).join("\\");
}

function quoteCompact(value) {
  return JSON.stringify(compactText(value));
}

function compactText(value, limit = 80) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

function countMatchLines(text) {
  const match = String(text ?? "").match(/(\d+)\s+matches?\b/i);
  if (match) return Number(match[1]);
  return countNonEmptyLines(text);
}

function countNonEmptyLines(text) {
  return String(text ?? "").split("\n").filter(Boolean).length;
}
