import { existsSync, readFileSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { getAttachmentRoot, imageExtensionForMime } from "./attachments.mjs";

const ATTACHMENT_MARKER_RE = /@\.march\/attachments\/[^\s"'`<>)]+/g;

const IMAGE_MIME_BY_EXT = Object.freeze({
  ".gif": "image/gif",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
});

export function resolveImageAttachmentReferences({ text, projectMarchDir } = {}) {
  if (!text || !projectMarchDir) return { images: [], references: [] };

  const seen = new Set();
  const images = [];
  const references = [];
  for (const marker of String(text).match(ATTACHMENT_MARKER_RE) || []) {
    if (seen.has(marker)) continue;
    seen.add(marker);

    const relativePath = marker.slice("@.march/".length);
    const path = assertInsideAttachmentRoot(join(projectMarchDir, relativePath), projectMarchDir);
    if (!existsSync(path)) continue;

    const mimeType = readSupportedAttachmentMimeType(path) ?? mimeTypeForPath(path);
    if (!mimeType) continue;

    const data = readFileSync(path).toString("base64");
    images.push({ type: "image", mimeType, data });
    references.push({ marker, path, mimeType });
  }

  return { images, references };
}

function readSupportedAttachmentMimeType(path) {
  const metadataPath = path.replace(/\.[^.\\/]+$/, ".json");
  if (!existsSync(metadataPath)) return null;
  try {
    const metadata = JSON.parse(readFileSync(metadataPath, "utf8"));
    if (typeof metadata.mimeType !== "string") return null;
    imageExtensionForMime(metadata.mimeType);
    return metadata.mimeType;
  } catch {
    return null;
  }
}

function mimeTypeForPath(path) {
  return IMAGE_MIME_BY_EXT[extname(path).toLowerCase()] ?? null;
}

function assertInsideAttachmentRoot(path, projectMarchDir) {
  const root = resolve(getAttachmentRoot(projectMarchDir));
  const resolvedPath = resolve(path);
  const rel = relative(root, resolvedPath);
  if (rel.startsWith("..") || rel === "" || resolve(root, rel) !== resolvedPath) {
    throw new Error("attachment marker escaped attachments root");
  }
  return resolvedPath;
}
