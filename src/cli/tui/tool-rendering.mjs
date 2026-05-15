import { extractToolOutput } from "../tool-output.mjs";
import { dim, red } from "./ui-theme.mjs";

export function writeToolStart({ output, name, args }) {
  output.writeln(dim(`  ${formatToolStartLine(name, args)}`));
}

export function writeToolEnd({
  output,
  name,
  isError,
  result,
  toolsExpanded = false,
  extractToolOutputImpl = extractToolOutput,
}) {
  if (isError) {
    const errText = extractToolOutputImpl(result);
    output.writeln(red(`  ◆ ${name} failed`));
    if (errText) {
      for (const line of errText.split("\n").slice(0, 6)) {
        output.writeln(red(`    ${line.slice(0, 120)}`));
      }
    }
    return true;
  }

  const out = extractToolOutputImpl(result);
  if (!toolsExpanded) {
    const summary = formatToolSuccessSummary(name, result, out);
    if (summary) output.writeln(dim(`    ${summary}`));
    return Boolean(summary);
  }
  if (!out) return false;
  const lines = out.split("\n");
  const limit = toolsExpanded ? 40 : 4;
  const show = lines.slice(0, limit);
  for (const line of show) {
    output.writeln(dim(`    ${line.slice(0, 120)}`));
  }
  if (lines.length > limit) output.writeln(dim(`    … (${lines.length - limit} more lines)`));
  return true;
}

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
  if (name === "open_file" || name === "close_file") return joinToolParts("◆", name, [compactPath(args?.path ?? args?.filePath ?? "")]);
  if (name === "web_search") return joinToolParts("◆", name, [quoteCompact(args?.query ?? "")]);
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
