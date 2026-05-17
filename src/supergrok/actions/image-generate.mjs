import { DEFAULT_SUPERGROK_IMAGE_MODEL } from "../constants.mjs";
import { readErrorMessage, successEnvelope } from "../response.mjs";
import { saveGeneratedImageAttachment } from "../../session/attachments.mjs";

const ASPECT_RATIOS = new Set(["1:1", "16:9", "4:3", "3:2", "2:3", "3:4", "9:16"]);
const RESOLUTIONS = new Set(["1k", "2k"]);

export async function runSuperGrokImageGenerate({ query, options = {}, credentials, projectMarchDir, fetchImpl = fetch } = {}) {
  if (!projectMarchDir) throw new Error("projectMarchDir is required for SuperGrok image generation");
  const model = String(options.model || DEFAULT_SUPERGROK_IMAGE_MODEL).trim() || DEFAULT_SUPERGROK_IMAGE_MODEL;
  const aspectRatio = normalizeEnum(options.aspect_ratio, ASPECT_RATIOS, "1:1");
  const resolution = normalizeEnum(options.resolution, RESOLUTIONS, "1k");
  const response = await fetchImpl(`${credentials.baseUrl}/images/generations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${credentials.apiKey}`,
      "Content-Type": "application/json",
      "User-Agent": "March-SuperGrok/0.1",
    },
    body: JSON.stringify({
      model,
      prompt: query,
      aspect_ratio: aspectRatio,
      resolution,
    }),
  });

  if (!response.ok) {
    throw new Error(`SuperGrok image generation failed (${response.status}): ${await readErrorMessage(response)}`);
  }

  const payload = await response.json();
  const first = payload.data?.[0] || {};
  const b64 = first.b64_json || first.image_base64 || "";
  const url = first.url || "";
  if (!b64 && !url) throw new Error("xAI image response contained neither b64_json nor url");

  const artifacts = [];
  if (b64) {
    const saved = saveGeneratedImageAttachment({ projectMarchDir, data: b64, mimeType: "image/png" });
    artifacts.push({ type: "image", path: saved.path, marker: saved.marker, mimeType: "image/png" });
  } else {
    artifacts.push({ type: "image", url, mimeType: first.mime_type || "image/png" });
  }

  return successEnvelope({
    credentialSource: credentials.credentialSource,
    action: "image_generate",
    model,
    query,
    artifacts,
    extra: { aspect_ratio: aspectRatio, resolution },
  });
}

function normalizeEnum(value, allowed, fallback) {
  const normalized = String(value || fallback).trim();
  if (!allowed.has(normalized)) return fallback;
  return normalized;
}
