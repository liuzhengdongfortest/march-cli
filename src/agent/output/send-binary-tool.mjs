import { statSync } from "node:fs";
import { basename, extname } from "node:path";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { toolText } from "../tool-result.mjs";
import { sendBinaryOutput } from "./binary-output-sink.mjs";

const SUPPORTED_TYPES = new Set(["image", "video", "audio", "file"]);
const MIME_BY_EXT = new Map([
  [".png", "image/png"], [".jpg", "image/jpeg"], [".jpeg", "image/jpeg"], [".webp", "image/webp"], [".gif", "image/gif"],
  [".mp4", "video/mp4"], [".mov", "video/quicktime"], [".webm", "video/webm"],
  [".mp3", "audio/mpeg"], [".wav", "audio/wav"], [".ogg", "audio/ogg"], [".opus", "audio/ogg"],
]);

export function createSendBinaryTool({ engine, sendBinary = sendBinaryOutput } = {}) {
  return defineTool({
    name: "send_binary",
    label: "Send Binary",
    description: "Send or display an existing binary artifact. In the TUI this opens local files with the system default app; in a gateway it sends image/video/audio/file media through the platform.",
    promptSnippet: "send_binary(type, path|url, caption?, mimeType?) - Send/display an existing image, video, audio, or file artifact.",
    promptGuidelines: [
      "Use send_binary when the user asks you to send, show, open, or deliver an existing media/file artifact.",
      "Do not use send_binary to generate media; first create or locate the artifact, then send it.",
    ],
    parameters: Type.Object({
      type: Type.String({ enum: [...SUPPORTED_TYPES], description: "Binary type: image, video, audio, or file" }),
      path: Type.Optional(Type.String({ description: "Local file path, absolute or relative to the workspace" })),
      url: Type.Optional(Type.String({ description: "Remote URL to send through gateway platforms" })),
      caption: Type.Optional(Type.String({ description: "Optional caption to send with the media" })),
      mimeType: Type.Optional(Type.String({ description: "Optional MIME type override" })),
    }),
    execute: async (_toolCallId, params) => {
      try {
        const binary = normalizeBinaryOutput(params, { engine });
        const sinkResult = await sendBinary(binary);
        return toolJson({ success: true, ...binary, sink: sinkResult }, { binary, sink: sinkResult });
      } catch (err) {
        return toolJson({ success: false, error: err.message }, { error: true });
      }
    },
  });
}

export function normalizeBinaryOutput(params, { engine } = {}) {
  const type = clean(params.type);
  if (!SUPPORTED_TYPES.has(type)) throw new Error("send_binary type must be one of: image, video, audio, file");
  const rawPath = clean(params.path);
  const url = clean(params.url);
  if (rawPath && url) throw new Error("send_binary accepts either path or url, not both");
  if (!rawPath && !url) throw new Error("send_binary requires path or url");

  if (url) {
    assertHttpUrl(url);
    return { type, url, caption: clean(params.caption), mimeType: clean(params.mimeType) };
  }

  const path = engine?.resolvePath ? engine.resolvePath(rawPath) : rawPath;
  const stat = statSync(path);
  if (!stat.isFile()) throw new Error(`send_binary path is not a file: ${path}`);
  return {
    type,
    path,
    filename: basename(path),
    caption: clean(params.caption),
    mimeType: clean(params.mimeType) ?? MIME_BY_EXT.get(extname(path).toLowerCase()) ?? "application/octet-stream",
    sizeBytes: stat.size,
  };
}

function assertHttpUrl(value) {
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error(`send_binary url is invalid: ${value}`); }
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("send_binary url must use http or https");
}

function clean(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function toolJson(payload, details = {}) {
  return toolText(JSON.stringify(payload, null, 2), details);
}
