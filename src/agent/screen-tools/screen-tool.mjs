import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { saveTemporaryPng } from "../image-assets/temp-png.mjs";
import { currentModelImageInputError } from "../vision-capability.mjs";
import { captureScreenWindows } from "./windows-screen.mjs";

export function createScreenTool({ getCurrentModel = null, captureScreenImpl = captureScreenWindows, imageAssetRoot = undefined } = {}) {
  return defineTool({
    name: "screen",
    label: "Screen Capture",
    description: "Capture the current desktop or a visible window, save it as a temporary PNG, and send it to the model as an image attachment when supported.",
    parameters: Type.Object({
      target: Type.Optional(Type.String({ description: "desktop (default) or window" })),
      windowId: Type.Optional(Type.String({ description: "Window id from list_windows when target is window" })),
    }),
    execute: async (_toolCallId, params = {}) => captureScreenTool({ getCurrentModel, captureScreenImpl, imageAssetRoot, ...params }),
  });
}

export function captureScreenTool({ getCurrentModel = null, captureScreenImpl = captureScreenWindows, imageAssetRoot = undefined, target = "desktop", windowId = null } = {}) {
  const normalizedTarget = target === "window" ? "window" : "desktop";
  const result = captureScreenImpl({ target: normalizedTarget, windowId });
  if (!result?.ok) return screenError(`Error capturing screen: ${result?.message || "unknown error"}`, { target: normalizedTarget, windowId });

  let path;
  try {
    path = saveTemporaryPng({ data: result.data, prefix: normalizedTarget === "window" ? "screen-window" : "screen-desktop", root: imageAssetRoot });
  } catch (err) {
    return screenError(`Error saving screenshot: ${err.message}`, { target: normalizedTarget, windowId });
  }

  const bounds = result.bounds ?? {};
  const label = normalizedTarget === "window" ? `window ${result.windowId || windowId}` : "desktop";
  const mimeType = result.mimeType || "image/png";
  const capabilityError = currentModelImageInputError(getCurrentModel);
  const text = [
    `Captured ${label} screenshot`,
    `Path: ${path}`,
    `MIME: ${mimeType}`,
    `Bounds: ${formatBounds(bounds)}`,
    capabilityError ? `${capabilityError} Saved a temporary PNG path; use analyze_images with this path for visual analysis.` : null,
  ].filter(Boolean).join("\n");
  const content = [{ type: "text", text }];
  if (!capabilityError) content.push({ type: "image", data: result.data, mimeType });
  return {
    content,
    details: {
      target: normalizedTarget,
      windowId: result.windowId ?? windowId ?? undefined,
      path,
      bounds,
      mimeType,
      unsupportedModel: capabilityError ? true : undefined,
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
