import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { extname, join } from "node:path";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { toolText } from "../../agent/tool-result.mjs";
import { callOfficeDaemon } from "../client/rpc.mjs";

export function createOfficeTools({ stateRoot = join(homedir(), ".march") } = {}) {
  return [officeStatusTool(stateRoot), officeObserveTool(stateRoot), officeJsTool(stateRoot)];
}

function officeStatusTool(stateRoot) {
  return defineTool({
    name: "office_status",
    label: "Office Status",
    description: "Check whether the March Office add-in is connected to the local Office bridge.",
    parameters: Type.Object({}),
    execute: async () => safeToolJson(() => callOfficeDaemon({ stateRoot, method: "status", timeoutMs: 3000 })),
  });
}

function officeObserveTool(stateRoot) {
  return defineTool({
    name: "powerpoint_observe",
    label: "PowerPoint Observe",
    description: "Read the current PowerPoint context as structured scene data for non-visual reasoning.",
    parameters: Type.Object({
      scope: Type.Optional(Type.Union([Type.Literal("selection"), Type.Literal("slide"), Type.Literal("deck")], { description: "Observation scope. Default is slide." })),
    }),
    execute: async (_id, params = {}) => safeToolJson(() => callOfficeDaemon({ stateRoot, method: "powerpoint.observe", params })),
  });
}

function officeJsTool(stateRoot) {
  return defineTool({
    name: "powerpoint_js",
    label: "PowerPoint JS",
    description: "Execute JavaScript inside the connected PowerPoint add-in. The code runs as an async function body with ctx, Office, PowerPoint, console, input, and assets in scope.",
    parameters: Type.Object({
      code: Type.String({ description: "JavaScript async function body. Use Office.js/PowerPoint.run directly and return a JSON-serializable result." }),
      input: Type.Optional(Type.Any()),
      assets: Type.Optional(Type.Array(PowerPointJsAsset, { description: "Optional assets exposed to the script as assets and ctx.assets. Local path assets are converted to base64 before reaching the add-in." })),
      timeoutMs: Type.Optional(Type.Number({ description: "Request timeout in milliseconds. Default 120000." })),
    }, { additionalProperties: false }),
    execute: async (_id, params = {}) => safeToolJson(async () => callOfficeDaemon({
      stateRoot,
      method: "powerpoint.js",
      params: { ...params, assets: await normalizePowerPointJsAssets(params.assets ?? []) },
      timeoutMs: normalizeTimeout(params.timeoutMs),
    })),
  });
}

const PowerPointJsAsset = Type.Object({
  name: Type.String(),
  path: Type.Optional(Type.String()),
  base64: Type.Optional(Type.String()),
  dataUrl: Type.Optional(Type.String()),
  mimeType: Type.Optional(Type.String()),
}, { additionalProperties: false });

async function normalizePowerPointJsAssets(assets) {
  return await Promise.all(assets.map(normalizePowerPointJsAsset));
}

async function normalizePowerPointJsAsset(asset) {
  if (!asset?.path) return asset;
  const base64 = await readFile(asset.path, "base64");
  const mimeType = asset.mimeType || inferMimeType(asset.path);
  return { ...asset, path: undefined, base64, dataUrl: `data:${mimeType};base64,${base64}`, mimeType };
}

function normalizeTimeout(value) {
  return Number.isFinite(value) && value > 0 ? value : 120000;
}

function inferMimeType(path) {
  const ext = extname(path).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  if (ext === ".svg") return "image/svg+xml";
  return "image/png";
}

async function safeToolJson(run) {
  try {
    return toolJson(await run());
  } catch (err) {
    return toolJson({ ok: false, error: err.message }, { error: true });
  }
}

function toolJson(payload, details = {}) {
  return toolText(JSON.stringify(payload, null, 2), details);
}
