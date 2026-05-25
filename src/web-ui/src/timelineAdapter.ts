import type { MarchTimelineEvent, TimelineItem } from "./model";

export function normalizeTimelineEvents(events: MarchTimelineEvent[]): TimelineItem[] {
  const items: TimelineItem[] = [];

  for (const event of events) {
    if (event.type === "tool_result") {
      const previous = items.at(-1);
      if (previous?.kind === "tool" && previous.tool === event.tool) {
        previous.summary = event.summary;
        previous.status = event.status;
        continue;
      }
    }

    items.push(toTimelineItem(event));
  }

  return items;
}

function toTimelineItem(event: MarchTimelineEvent): TimelineItem {
  switch (event.type) {
    case "user_message":
      return { id: event.id, kind: "message", actor: "user", text: event.text, time: event.time };
    case "assistant_message":
      return { id: event.id, kind: "message", actor: "march", text: event.text, time: event.time };
    case "assistant_thought":
      return { id: event.id, kind: "thought", title: event.title, text: event.text, status: event.status };
    case "tool_call":
      return { id: event.id, kind: "tool", tool: event.tool, target: event.target, status: event.status };
    case "tool_result":
      return { id: event.id, kind: "tool", tool: event.tool, target: "result", status: event.status, summary: event.summary };
    case "file_diff":
      return { id: event.id, kind: "diff", path: event.path, lines: event.lines };
    case "terminal_output":
      return { id: event.id, kind: "terminal", command: event.command, output: event.output, status: event.status };

    case "error":
      return { id: event.id, kind: "error", message: event.message, detail: event.detail };
  }
}
