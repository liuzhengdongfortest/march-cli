import { readFileSync, statSync } from "node:fs";
import { extname } from "node:path";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { currentModelImageInputError } from "../vision-capability.mjs";
const IMAGE_MIME_BY_EXT = new Map([
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".gif", "image/gif"],
]);

export function createReadImageTool({ engine, getCurrentModel = null }) {
  return defineTool({
    name: "read_image",
    label: "Read Image",
    description: "Read a local image file and send it to the model as an image attachment. Supports png, jpg/jpeg, webp, and gif.",
    parameters: Type.Object({
      path: Type.String({ description: "Absolute or relative path to the image file" }),
    }),
    execute: async (_toolCallId, params) => {
      const capabilityError = currentModelImageInputError(getCurrentModel);
      if (capabilityError) return imageError(capabilityError, { unsupportedModel: true });
      return readImageFile({ engine, ...params });
    },
  });
}

export function readImageFile({ engine, path }) {
  const absPath = engine.resolvePath(path);
  let stat;
  try {
    stat = statSync(absPath);
  } catch (err) {
    return imageError(`Error reading image ${absPath}: ${err.message}`, { path: absPath });
  }
  if (stat.isDirectory()) {
    return imageError(`Error reading image ${absPath}: this is a directory. Use ls(path) or find(pattern, path) to inspect it.`, { path: absPath, isDirectory: true });
  }

  const mimeType = IMAGE_MIME_BY_EXT.get(extname(absPath).toLowerCase());
  if (!mimeType) {
    return imageError(`Error reading image ${absPath}: unsupported image type. Supported types: png, jpg, jpeg, webp, gif.`, { path: absPath });
  }

  let data;
  try {
    data = readFileSync(absPath).toString("base64");
  } catch (err) {
    return imageError(`Error reading image ${absPath}: ${err.message}`, { path: absPath });
  }

  const size = formatSize(stat.size);
  return {
    content: [
      { type: "text", text: `Read image file: ${absPath}\nMIME: ${mimeType}\nSize: ${size}` },
      { type: "image", data, mimeType },
    ],
    details: {
      path: absPath,
      mimeType,
      sizeBytes: stat.size,
    },
  };
}

function imageError(text, details = {}) {
  return { content: [{ type: "text", text }], details: { ...details, error: true } };
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
