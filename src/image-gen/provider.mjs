import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { getOAuthProvider } from "@earendil-works/pi-ai/oauth";

const CODEX_BASE_URL = "https://chatgpt.com/backend-api/codex/responses";
const JWT_CLAIM_PATH = "https://api.openai.com/auth";

const ASPECT_RATIO_MAP = {
  "1:1": "1024x1024",
  "16:9": "1792x1024",
  "4:3": "1024x768",
  "3:2": "1536x1024",
};

function extractAccountId(token) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) throw new Error("Invalid token");
    const payload = JSON.parse(atob(parts[1]));
    const accountId = payload?.[JWT_CLAIM_PATH]?.chatgpt_account_id;
    if (!accountId) throw new Error("No account ID in token");
    return accountId;
  } catch {
    throw new Error("Failed to extract account ID from token");
  }
}

function buildHeaders(token, accountId) {
  return {
    Authorization: `Bearer ${token}`,
    "chatgpt-account-id": accountId,
    originator: "march",
    "User-Agent": "march-cli",
    "OpenAI-Beta": "responses=experimental",
    accept: "text/event-stream",
    "content-type": "application/json",
  };
}

function buildRequestBody(prompt, quality, size) {
  return {
    model: "gpt-5.4",
    stream: true,
    input: prompt,
    tools: [
      {
        type: "image_generation",
        model: "gpt-image-2",
        size,
        quality: quality || "medium",
      },
    ],
    tool_choice: "auto",
  };
}

async function* parseSSE(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buffer.indexOf("\n\n")) !== -1) {
        const chunk = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const dataLines = chunk
          .split("\n")
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).trim());
        if (dataLines.length > 0) {
          const data = dataLines.join("\n").trim();
          if (data && data !== "[DONE]") {
            yield JSON.parse(data);
          }
        }
      }
    }
  } finally {
    try {
      reader.cancel();
    } catch {}
  }
}

export async function generateImage({ prompt, quality = "medium", aspectRatio = "1:1", authStorage }) {
  const credentials = authStorage.get("openai-codex");
  if (!credentials) throw new Error("OpenAI Codex not authenticated. Run: march login openai-codex");

  const provider = getOAuthProvider("openai-codex");
  let apiKey = provider.getApiKey(credentials);

  if (Date.now() >= credentials.expires) {
    const refreshed = await provider.refreshToken(credentials);
    apiKey = provider.getApiKey(refreshed);
    authStorage.set("openai-codex", refreshed);
  }

  const accountId = extractAccountId(apiKey);
  const size = ASPECT_RATIO_MAP[aspectRatio] || "1024x1024";

  const response = await fetch(CODEX_BASE_URL, {
    method: "POST",
    headers: buildHeaders(apiKey, accountId),
    body: JSON.stringify(buildRequestBody(prompt, quality, size)),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Codex image generation failed (${response.status}): ${text || response.statusText}`);
  }

  let imageBase64 = null;
  let mimeType = "image/png";

  for await (const event of parseSSE(response)) {
    const type = event.type;

    if (type === "response.output_item.added") {
      continue;
    }

    if (type === "response.output_item.done") {
      const item = event.item;
      if (!item) continue;

      if (item.type === "file" && item.filename?.endsWith?.(".png")) {
        const content = item.content?.[0];
        if (content?.type === "image_file" && content.image_base64) {
          imageBase64 = content.image_base64;
          mimeType = "image/png";
        }
      }

      for (const part of item.content || []) {
        if (part.type === "image_file" && part.image_base64) {
          imageBase64 = part.image_base64;
          mimeType = "image/png";
        }
        if (part.type === "output_text" && isBase64(part.text)) {
          imageBase64 = part.text;
        }
      }

      if (item.base64) imageBase64 = item.base64;
      continue;
    }

    if (type === "response.completed" || type === "response.incomplete") {
      const resp = event.response;
      if (resp?.output) {
        for (const item of resp.output) {
          for (const part of item.content || []) {
            if (part.type === "image_file" && part.image_base64) {
              imageBase64 = part.image_base64;
              mimeType = "image/png";
            }
          }
        }
      }
      break;
    }

    if (type === "error") {
      throw new Error(`Codex error: ${event.message || JSON.stringify(event)}`);
    }

    if (type === "response.failed") {
      const msg = event.response?.error?.message || "Image generation failed";
      throw new Error(msg);
    }
  }

  if (!imageBase64) {
    throw new Error("No image data received from Codex");
  }

  const cacheDir = join(homedir(), ".march", "cache", "images");
  if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true });
  const filename = `${randomUUID()}.png`;
  const filePath = join(cacheDir, filename);
  writeFileSync(filePath, Buffer.from(imageBase64, "base64"));

  return { filePath, mimeType };
}

function isBase64(str) {
  if (typeof str !== "string" || str.length < 100) return false;
  return /^[A-Za-z0-9+/]*={0,2}$/.test(str);
}
