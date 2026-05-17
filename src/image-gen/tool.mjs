import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { toolText } from "../agent/tool-result.mjs";
import { generateImage } from "./provider.mjs";

export function createImageGenTool({ authStorage }) {
  return defineTool({
    name: "image_generate",
    label: "Image Generation",
    description:
      "Generate an image using ChatGPT's image generation engine (gpt-image-2). " +
      "Three quality levels: low (~15s, drafts), medium (~40s, default), high (~2min, highest detail). " +
      "Supported aspect ratios: 1:1, 16:9, 4:3, 3:2. Default: 1:1.",
    promptSnippet: "image_generate(prompt, quality?, aspectRatio?) - Generate an image using ChatGPT",
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
    }),
    execute: async (_toolCallId, params) => {
      try {
        const { prompt, quality = "medium", aspectRatio = "1:1" } = params;
        const { filePath } = await generateImage({ prompt, quality, aspectRatio, authStorage });
        return toolText(`Image generated and saved to: ${filePath}`, { filePath });
      } catch (err) {
        return toolText(`Image generation failed: ${err.message}`, { error: true });
      }
    },
  });
}
