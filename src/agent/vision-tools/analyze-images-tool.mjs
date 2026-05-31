import { readFileSync, statSync } from "node:fs";
import { extname } from "node:path";
import { completeSimple, Type } from "@earendil-works/pi-ai";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { modelSupportsImageInput } from "../vision-capability.mjs";

const IMAGE_MIME_BY_EXT = new Map([
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".gif", "image/gif"],
]);

export function createAnalyzeImagesTool({ engine, modelRegistry, imageModel = null } = {}) {
  return defineTool({
    name: "analyze_images",
    label: "Analyze Images",
    description: "Analyze one or more local images with the configured imageModel. Use this for visual understanding, OCR, or comparing images when the current model cannot or should not inspect images directly.",
    parameters: Type.Object({
      images: Type.Array(Type.Object({
        path: Type.String({ description: "Local image path. Temporary screenshot paths returned by screen or browser_screenshot are supported." }),
      }), { description: "One or more images to analyze." }),
      prompt: Type.String({ description: "Instruction for the image model, e.g. describe the UI or compare differences between images." }),
    }),
    execute: async (_toolCallId, params = {}) => analyzeImages({ engine, modelRegistry, imageModel, ...params }),
  });
}

export async function analyzeImages({ engine, modelRegistry, imageModel = null, images = [], prompt = "" } = {}) {
  const selection = normalizeImageModelSelection(imageModel);
  if (!selection) return visionError("No imageModel configured. Configure imageModel as { provider, model } to use analyze_images.", { missingImageModel: true });
  if (!modelRegistry?.find) return visionError("Model registry is not available for analyze_images.");

  const model = modelRegistry.find(selection.provider, selection.model);
  if (!model) return visionError(`Configured imageModel not found: ${selection.provider}/${selection.model}`, { imageModel: selection });
  if (!modelSupportsImageInput(model)) return visionError(`Configured imageModel does not support image input: ${model.name || model.id} (${model.provider}).`, { imageModel: selection, unsupportedImageModel: true });

  const prepared = prepareImageInputs({ engine, images });
  if (prepared.error) return visionError(prepared.error, prepared.details);

  let auth;
  try {
    auth = await modelRegistry.getApiKeyAndHeaders(model);
  } catch (err) {
    return visionError(`Error resolving imageModel auth: ${err.message}`, { imageModel: selection });
  }
  if (!auth?.ok) return visionError(auth?.error || `No auth configured for imageModel: ${selection.provider}/${selection.model}`, { imageModel: selection });

  const context = {
    systemPrompt: "You are March's vision analysis submodel. Analyze the provided image inputs and answer the user's prompt in precise text. Do not claim access to anything beyond the supplied images.",
    messages: [{
      role: "user",
      timestamp: Date.now(),
      content: [
        { type: "text", text: buildVisionPrompt({ prompt, images: prepared.images }) },
        ...prepared.images.map((image) => ({ type: "image", data: image.data, mimeType: image.mimeType })),
      ],
    }],
    tools: [],
  };

  let message;
  try {
    message = await completeSimple(model, context, { apiKey: auth.apiKey, headers: auth.headers, maxTokens: 4096 });
  } catch (err) {
    return visionError(`Error calling imageModel ${selection.provider}/${selection.model}: ${err.message}`, { imageModel: selection });
  }

  const text = extractAssistantText(message);
  if (!text) return visionError(`imageModel ${selection.provider}/${selection.model} returned no text.`, { imageModel: selection });
  return {
    content: [{ type: "text", text: `Analyzed ${prepared.images.length} image(s) with imageModel ${selection.provider}/${selection.model}.\n\nResult:\n${text}` }],
    details: {
      imageModel: selection,
      images: prepared.images.map(({ path, mimeType, sizeBytes }) => ({ path, mimeType, sizeBytes })),
      usage: message?.usage,
    },
  };
}

export function normalizeImageModelSelection(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const provider = stringValue(value.provider);
  const model = stringValue(value.model ?? value.modelId);
  return provider && model ? { provider, model } : null;
}

function prepareImageInputs({ engine, images }) {
  if (!Array.isArray(images) || images.length === 0) return { error: "analyze_images requires at least one image path.", details: { images } };
  const prepared = [];
  for (const [index, image] of images.entries()) {
    const inputPath = typeof image === "string" ? image : image?.path;
    if (!inputPath) return { error: `Image #${index + 1} requires path.`, details: { index } };
    const absPath = engine?.resolvePath ? engine.resolvePath(inputPath) : inputPath;
    let stat;
    try {
      stat = statSync(absPath);
    } catch (err) {
      return { error: `Error reading image ${absPath}: ${err.message}`, details: { path: absPath } };
    }
    if (stat.isDirectory()) return { error: `Error reading image ${absPath}: this is a directory.`, details: { path: absPath, isDirectory: true } };
    const mimeType = IMAGE_MIME_BY_EXT.get(extname(absPath).toLowerCase());
    if (!mimeType) return { error: `Error reading image ${absPath}: unsupported image type. Supported types: png, jpg, jpeg, webp, gif.`, details: { path: absPath } };
    let data;
    try {
      data = readFileSync(absPath).toString("base64");
    } catch (err) {
      return { error: `Error reading image ${absPath}: ${err.message}`, details: { path: absPath } };
    }
    prepared.push({ path: absPath, mimeType, sizeBytes: stat.size, data });
  }
  return { images: prepared };
}

function buildVisionPrompt({ prompt, images }) {
  const imageList = images.map((image, index) => `Image ${index + 1}: ${image.path} (${image.mimeType}, ${formatSize(image.sizeBytes)})`).join("\n");
  return `${String(prompt || "Describe the image(s).").trim()}\n\nImages:\n${imageList}`;
}

function extractAssistantText(message) {
  return (message?.content ?? [])
    .filter((item) => item?.type === "text" && typeof item.text === "string")
    .map((item) => item.text.trim())
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

function visionError(text, details = {}) {
  return { content: [{ type: "text", text }], details: { ...details, error: true } };
}

function stringValue(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
