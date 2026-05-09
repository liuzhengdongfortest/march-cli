import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";

export const ATTACHMENT_STORE_VERSION = 1;

const IMAGE_EXTENSIONS = Object.freeze({
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
});

export function getAttachmentRoot(projectMarchDir) {
  if (!projectMarchDir) throw new Error("projectMarchDir is required");
  return join(projectMarchDir, "attachments");
}

export function getSessionAttachmentDir({ projectMarchDir, sessionId }) {
  return join(getAttachmentRoot(projectMarchDir), sanitizePathSegment(sessionId || "session"));
}

export function saveImageAttachment({
  projectMarchDir,
  sessionId,
  data,
  mimeType,
  source = "unknown",
  now = new Date(),
  id = randomUUID().slice(0, 8),
} = {}) {
  const ext = imageExtensionForMime(mimeType);
  const buffer = toBuffer(data);
  if (buffer.length === 0) throw new Error("attachment data is empty");

  const dir = getSessionAttachmentDir({ projectMarchDir, sessionId });
  mkdirSync(dir, { recursive: true });

  const createdAt = now.toISOString();
  const stem = `${formatTimestampForFile(createdAt)}_${sanitizePathSegment(id)}`;
  const path = assertInsideRoot(resolve(dir, `${stem}.${ext}`), getAttachmentRoot(projectMarchDir));
  const metadataPath = assertInsideRoot(resolve(dir, `${stem}.json`), getAttachmentRoot(projectMarchDir));
  writeFileSync(path, buffer);

  const metadata = {
    version: ATTACHMENT_STORE_VERSION,
    sessionId: sessionId || null,
    source,
    mimeType,
    sizeBytes: buffer.length,
    createdAt,
    filename: basename(path),
    relativePath: toProjectMarchRelative(projectMarchDir, path),
  };
  writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
  return {
    path,
    metadataPath,
    relativePath: metadata.relativePath,
    metadata,
  };
}

export function imageExtensionForMime(mimeType) {
  const ext = IMAGE_EXTENSIONS[String(mimeType || "").toLowerCase()];
  if (!ext) throw new Error(`unsupported image mime type: ${mimeType || "unknown"}`);
  return ext;
}

export function sanitizePathSegment(value) {
  return String(value || "value")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 80) || "value";
}

function toBuffer(data) {
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof Uint8Array) return Buffer.from(data);
  if (typeof data === "string") return Buffer.from(data, "base64");
  throw new Error("attachment data must be a Buffer, Uint8Array, or base64 string");
}

function formatTimestampForFile(isoString) {
  return isoString.replace(/[:.]/g, "-");
}

function assertInsideRoot(path, root) {
  const resolvedRoot = resolve(root);
  const resolvedPath = resolve(path);
  const rel = relative(resolvedRoot, resolvedPath);
  if (rel.startsWith("..") || rel === "" || resolve(resolvedRoot, rel) !== resolvedPath) {
    throw new Error("attachment path escaped attachments root");
  }
  return resolvedPath;
}

function toProjectMarchRelative(projectMarchDir, path) {
  return relative(resolve(projectMarchDir), resolve(path)).replace(/\\/g, "/");
}
