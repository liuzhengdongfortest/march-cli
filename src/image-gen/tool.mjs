import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { toolText } from "../agent/tool-result.mjs";
import { openFileWithDefaultApp } from "../platform/open-file.mjs";
import { generateImage } from "./provider.mjs";

export function createImageGenTool({
  authStorage,
  projectMarchDir,
  generateImageImpl = generateImage,
  openFileImpl = openFileWithDefaultApp,
}) {
  return defineTool({
    name: "image_generate",
    label: "Image Generation",
    description:
      "Generate an image using ChatGPT's image generation engine (gpt-image-2). " +
      "Three quality levels: low (~15s, drafts), medium (~40s, default), high (~2min, highest detail). " +
      "Supported aspect ratios: 1:1, 16:9, 4:3, 3:2. Default: 1:1.",
    promptSnippet: "image_generate(prompt, quality?, aspectRatio?, auto_open?) - Generate an image using ChatGPT",
    promptGuidelines: [
      "When the user asks you to generate or draw an image, use the image_generate tool.",
      "Describe what you want to generate in detail for best results.",
    ],
    parameters: Type.Object({
      prompt: Type.String({
        description: "Detailed description of the image to generate",
      }),
      quality: Type.Optional(
        Type.String({
          enum: ["low", "medium", "high"],
          description: "Generation quality. medium is default.",
        })
      ),
      aspectRatio: Type.Optional(
        Type.String({
          enum: ["1:1", "16:9", "4:3", "3:2"],
          description: "Aspect ratio. 1:1 is default.",
        })
      ),
      auto_open: Type.Optional(
        Type.Boolean({
          description: "Open the generated image with the system default app. true is default.",
        })
      ),
    }),
    execute: async (_toolCallId, params) => {
      try {
        const { prompt, quality = "medium", aspectRatio = "1:1", auto_open: autoOpen = true } = params;
        const image = await generateImageImpl({ prompt, quality, aspectRatio, authStorage, projectMarchDir });
        const openResult = autoOpen ? await openGeneratedImage(image.filePath, openFileImpl) : { opened: false };
        return toolJson({
          success: true,
          image: image.marker,
          path: image.filePath,
          mimeType: image.mimeType,
          prompt,
          aspectRatio,
          quality,
          ...openResult,
        }, { ...image, ...openResult });
      } catch (err) {
        return toolJson({
          success: false,
          image: null,
          error: err.message,
        }, { error: true });
      }
    },
  });
}

async function openGeneratedImage(filePath, openFileImpl) {
  try {
    await openFileImpl(filePath);
    return { opened: true };
  } catch (err) {
    return { opened: false, openError: err.message };
  }
}

function toolJson(payload, details = {}) {
  return toolText(JSON.stringify(payload, null, 2), details);
}
