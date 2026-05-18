import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { currentModelImageInputError } from "../vision-capability.mjs";
import { captureScreenWindows } from "./windows-screen.mjs";

export function createScreenTool({ getCurrentModel = null, captureScreenImpl = captureScreenWindows } = {}) {
  return defineTool({
    name: "screen",
    label: "Screen Capture",
    description: "Capture the current desktop or a visible window and send it to the model as an image attachment.",
    parameters: Type.Object({
      target: Type.Optional(Type.String({ description: "desktop (default) or window" })),
      windowId: Type.Optional(Type.String({ description: "Window id from list_windows when target is window" })),
    }),
    execute: async (_toolCallId, params = {}) => captureScreenTool({ getCurrentModel, captureScreenImpl, ...params }),
  });
}

export function captureScreenTool({ getCurrentModel = null, captureScreenImpl = captureScreenWindows, target = "desktop", windowId = null } = {}) {
  const capabilityError = currentModelImageInputError(getCurrentModel);
  if (capabilityError) return screenError(capabilityError, { unsupportedModel: true });
  const normalizedTarget = target === "window" ? "window" : "desktop";
  const result = captureScreenImpl({ target: normalizedTarget, windowId });
  if (!result?.ok) return screenError(`Error capturing screen: ${result?.message || "unknown error"}`, { target: normalizedTarget, windowId });

  const bounds = result.bounds ?? {};
  const label = normalizedTarget === "window" ? `window ${result.windowId || windowId}` : "desktop";
  return {
    content: [
      { type: "text", text: `Captured ${label} screenshot\nMIME: ${result.mimeType || "image/png"}\nBounds: ${formatBounds(bounds)}` },
      { type: "image", data: result.data, mimeType: result.mimeType || "image/png" },
    ],
    details: {
      target: normalizedTarget,
      windowId: result.windowId ?? windowId ?? undefined,
      bounds,
      mimeType: result.mimeType || "image/png",
    },
  };
}

function screenError(text, details = {}) {
  return { content: [{ type: "text", text }], details: { ...details, error: true } };
}

function formatBounds(bounds) {
  const { x = 0, y = 0, width = 0, height = 0 } = bounds ?? {};
  return `${width}x${height} at ${x},${y}`;
}
