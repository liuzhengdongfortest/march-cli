import { extractToolOutput } from "../tool-output.mjs";
import { dim, red } from "./ui-theme.mjs";

export function writeToolStart({ output, name, args }) {
  output.writeln("");
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
  if (name === "read") {
    const path = compactPath(args?.path ?? args?.filePath ?? "");
    return `→ Read ${path}${formatOptions(args, ["path", "filePath"])}`;
  }
  if (name === "grep") {
    const path = compactPath(args?.path ?? "");
    const target = path ? ` in ${path}` : "";
    return `✱ Grep ${JSON.stringify(String(args?.pattern ?? ""))}${target}${formatOptions(args, ["pattern", "path"])}`;
  }
  if (name === "glob") {
    const path = compactPath(args?.path ?? "");
    const target = path ? ` in ${path}` : "";
    return `✱ Glob ${JSON.stringify(String(args?.pattern ?? ""))}${target}${formatOptions(args, ["pattern", "path"])}`;
  }
  if (name === "find") {
    const path = compactPath(args?.path ?? "");
    const target = path ? ` in ${path}` : "";
    return `✱ Find ${JSON.stringify(String(args?.pattern ?? ""))}${target}${formatOptions(args, ["pattern", "path"])}`;
  }
  return `◆ ${name}${formatOptions(args, [])}`;
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

function formatOptions(args = {}, omitKeys = []) {
  const omit = new Set(omitKeys);
  const parts = [];
  for (const [key, value] of Object.entries(args ?? {})) {
    if (omit.has(key) || value == null) continue;
    parts.push(`${key}=${JSON.stringify(value)}`);
  }
  return parts.length ? ` [${parts.join(", ")}]` : "";
}

function compactPath(path) {
  return String(path ?? "").split(/[/\\]/).filter(Boolean).slice(-4).join("\\");
}

function countMatchLines(text) {
  const match = String(text ?? "").match(/(\d+)\s+matches?\b/i);
  if (match) return Number(match[1]);
  return countNonEmptyLines(text);
}

function countNonEmptyLines(text) {
  return String(text ?? "").split("\n").filter(Boolean).length;
}
