import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { getAttachmentRoot } from "../session/attachments.mjs";

const IMAGE_MIME_BY_EXT = Object.freeze({
  ".gif": "image/gif",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
});

export function prepareReferenceImages({ referenceImages, projectMarchDir }) {
  if (referenceImages == null) return [];
  if (!Array.isArray(referenceImages)) throw new Error("reference_images must be an array of image paths");
  return referenceImages.map((image, index) => readReferenceImage({ image, index, projectMarchDir }));
}

function readReferenceImage({ image, index, projectMarchDir }) {
  const inputPath = typeof image === "string" ? image : image?.path;
  if (!inputPath) throw new Error(`reference_images[${index}] requires a path`);

  const path = resolveReferenceImagePath({ inputPath, projectMarchDir });
  let stat;
  try {
    stat = statSync(path);
  } catch (err) {
    throw new Error(`Error reading reference image ${inputPath}: ${err.message}`);
  }
  if (stat.isDirectory()) throw new Error(`Error reading reference image ${inputPath}: this is a directory`);

  const mimeType = IMAGE_MIME_BY_EXT[extname(path).toLowerCase()];
  if (!mimeType) {
    throw new Error(`Error reading reference image ${inputPath}: unsupported image type. Supported types: png, jpg, jpeg, webp, gif.`);
  }

  return { path, mimeType, data: readFileSync(path).toString("base64") };
}

function resolveReferenceImagePath({ inputPath, projectMarchDir }) {
  if (inputPath.startsWith("@.march/attachments/")) {
    const relativePath = inputPath.slice("@.march/".length);
    const path = assertInsideAttachmentRoot(join(projectMarchDir, relativePath), projectMarchDir);
    if (!existsSync(path)) throw new Error(`reference image attachment not found: ${inputPath}`);
    return path;
  }
  return resolve(inputPath);
}

function assertInsideAttachmentRoot(path, projectMarchDir) {
  const root = resolve(getAttachmentRoot(projectMarchDir));
  const resolvedPath = resolve(path);
  const rel = relative(root, resolvedPath);
  if (rel.startsWith("..") || rel === "" || resolve(root, rel) !== resolvedPath) {
    throw new Error("reference image attachment escaped attachments root");
  }
  return resolvedPath;
}
