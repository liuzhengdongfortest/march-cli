import type { MarchTimelineEvent } from "../model";
import type { RuntimeUiEvent } from "./client";

export function applyRuntimeEvent(events: MarchTimelineEvent[], event: RuntimeUiEvent): MarchTimelineEvent[] {
  const next = [...events];
  const id = `${event.type}:${next.length}:${Date.now()}`;
  switch (event.type) {
    case "web_user_message":
      next.push({ id, type: "user_message", text: event.text, time: nowTime() });
      return next;
    case "text_delta":
      return appendAssistantDelta(next, event.delta, id);
    case "thinking_start":
      next.push({ id, type: "assistant_thought", title: "Thinking", text: "", status: "open" });
      return next;
    case "thinking_delta":
      return appendThoughtDelta(next, event.delta, id);
    case "thinking_end":
      return closeThought(next);
    case "tool_start":
      next.push({ id, type: "tool_call", tool: event.name, target: formatArgs(event.args), status: "running" });
      return next;
    case "tool_end":
      next.push({ id, type: "tool_result", tool: event.name, summary: formatResult(event.result), status: event.isError ? "failed" : "done" });
      return next;
    case "edit_diff":
      next.push({ id, type: "file_diff", path: event.path, lines: toDiffLines(event.diffLines) });
      return next;
    case "recall":
      if ((event.hints?.length ?? 0) || event.report) {
        next.push({ id, type: "memory_recall", hints: event.hints ?? [], report: event.report ?? null, variant: event.variant });
      }
      return next;

    case "status":
      next.push({ id, type: "terminal_output", command: "status", output: event.text, status: "done" });
      return next;
    case "retry_start":
      next.push({ id, type: "error", message: "Retrying", detail: event.errorMessage });
      return next;
    case "retry_end":
      if (!event.success && event.finalError) next.push({ id, type: "error", message: "Retry failed", detail: event.finalError });
      return next;
    default:
      return next;
  }
}

function appendAssistantDelta(events: MarchTimelineEvent[], delta: string, id: string) {
  const last = events.at(-1);
  if (last?.type === "assistant_message") last.text += delta;
  else events.push({ id, type: "assistant_message", text: delta, time: nowTime() });
  return events;
}

function appendThoughtDelta(events: MarchTimelineEvent[], delta: string, id: string) {
  const last = events.at(-1);
  if (last?.type === "assistant_thought" && last.status === "open") last.text += delta;
  else events.push({ id, type: "assistant_thought", title: "Thinking", text: delta, status: "open" });
  return events;
}

function closeThought(events: MarchTimelineEvent[]) {
  const last = events.at(-1);
  if (last?.type === "assistant_thought") last.status = "closed";
  return events;
}

function toDiffLines(lines: Array<{ type?: string; text?: string }> = []) {
  return lines.map((line) => ({ kind: toDiffKind(line.type), text: line.text ?? "" }));
}

function toDiffKind(type?: string): "add" | "remove" | "keep" {
  if (type === "add") return "add";
  if (type === "del") return "remove";
  return "keep";
}

function formatArgs(args: unknown) {
  if (args === undefined || args === null) return "running";
  return JSON.stringify(args).slice(0, 160);
}

function formatResult(result: unknown) {
  if (result === undefined || result === null) return "done";
  return typeof result === "string" ? result.slice(0, 240) : JSON.stringify(result).slice(0, 240);
}

function nowTime() {
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date());
}
