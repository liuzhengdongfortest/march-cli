import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const DEFAULT_IMAGE_ASSET_ROOT = join(tmpdir(), "march-cli", "images");

export function saveTemporaryPng({ data, prefix = "image", root = DEFAULT_IMAGE_ASSET_ROOT } = {}) {
  if (typeof data !== "string" || !data) throw new Error("image data is required");
  mkdirSync(root, { recursive: true });
  const path = join(root, `${sanitizePrefix(prefix)}-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}.png`);
  writeFileSync(path, Buffer.from(data, "base64"));
  return path;
}

function sanitizePrefix(value) {
  const prefix = String(value || "image").toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return prefix || "image";
}
