import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { listWindowsWindows } from "./windows-screen.mjs";

export function createListWindowsTool({ listWindowsImpl = listWindowsWindows } = {}) {
  return defineTool({
    name: "list_windows",
    label: "List Windows",
    description: "List visible desktop windows so the model can choose a windowId for screen({ target: 'window', windowId }).",
    parameters: Type.Object({
      limit: Type.Optional(Type.Number({ description: "Maximum windows to return; default 30" })),
    }),
    execute: async (_toolCallId, params = {}) => listWindowsTool({ listWindowsImpl, ...params }),
  });
}

export function listWindowsTool({ listWindowsImpl = listWindowsWindows, limit = 30 } = {}) {
  const result = listWindowsImpl();
  if (!result?.ok) return textResult(`Error listing windows: ${result?.message || "unknown error"}`, { error: true });
  const windows = (result.windows ?? []).slice(0, normalizeLimit(limit));
  if (windows.length === 0) return textResult("No visible windows found.", { windows: [] });
  const lines = ["Visible windows:"];
  for (const item of windows) {
    const process = item.process ? ` (${item.process})` : "";
    const bounds = item.bounds ? ` ${item.bounds.width}x${item.bounds.height}+${item.bounds.x},${item.bounds.y}` : "";
    const minimized = item.minimized ? " minimized" : "";
    lines.push(`- ${item.id}${process}${bounds}${minimized}: ${item.title}`);
  }
  lines.push("Use screen({ target: 'window', windowId }) to capture a listed window.");
  return textResult(lines.join("\n"), { windows });
}

function normalizeLimit(limit) {
  return Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 100) : 30;
}

function textResult(text, details = {}) {
  return { content: [{ type: "text", text }], details };
}
