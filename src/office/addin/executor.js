// JS execution is the PowerPoint mutation boundary for experimental high-fidelity automation.
export function capabilities() {
  return [
    "powerpoint.observe",
    "powerpoint.js",
  ];
}

export async function executePowerPointJs({ code, input = null, assets = [] } = {}) {
  if (typeof code !== "string" || code.trim() === "") throw new Error("powerpoint.js requires non-empty code");

  const logs = [];
  const scriptConsole = createScriptConsole(logs);
  const ctx = {
    Office,
    PowerPoint,
    input,
    assets,
    console: scriptConsole,
    helpers: createHelpers(assets),
  };

  const script = new Function("ctx", "Office", "PowerPoint", "console", "input", "assets", `"use strict";\nreturn (async () => {\n${code}\n})();`);
  try {
    const result = await script(ctx, Office, PowerPoint, scriptConsole, input, assets);
    return { ok: true, result: toJsonSafe(result), logs };
  } catch (err) {
    err.logs = logs;
    throw err;
  }
}

function createScriptConsole(logs) {
  const push = (level, values) => {
    logs.push({ level, message: values.map(formatLogValue).join(" ") });
  };
  return {
    log: (...values) => push("log", values),
    info: (...values) => push("info", values),
    warn: (...values) => push("warn", values),
    error: (...values) => push("error", values),
  };
}

function createHelpers(assets) {
  return {
    selectedSlide,
    readSlideSize,
    imageBase64: (assetOrName) => imageBase64(assets, assetOrName),
    imageDataUrl: (assetOrName) => imageDataUrl(assets, assetOrName),
  };
}

async function selectedSlide(context) {
  const slides = context.presentation.getSelectedSlides();
  slides.load("items/id");
  await context.sync();
  const slide = slides.items[0];
  if (!slide) throw new Error("No selected slide");
  return slide;
}

async function readSlideSize(context) {
  if (!Office.context.requirements?.isSetSupported?.("PowerPointApi", "1.10")) return null;
  const pageSetup = context.presentation.pageSetup;
  pageSetup.load("slideWidth,slideHeight");
  await context.sync();
  return { w: pageSetup.slideWidth, h: pageSetup.slideHeight };
}

function imageBase64(assets, assetOrName) {
  const asset = resolveAsset(assets, assetOrName);
  const value = asset?.base64 ?? asset?.dataUrl;
  if (!value) throw new Error(`No base64 image asset: ${String(assetOrName)}`);
  return String(value).replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "");
}

function imageDataUrl(assets, assetOrName) {
  const asset = resolveAsset(assets, assetOrName);
  if (asset?.dataUrl) return asset.dataUrl;
  if (asset?.base64) return `data:${asset.mimeType || "image/png"};base64,${asset.base64}`;
  throw new Error(`No image asset: ${String(assetOrName)}`);
}

function resolveAsset(assets, assetOrName) {
  if (assetOrName && typeof assetOrName === "object") return assetOrName;
  const name = String(assetOrName);
  return assets.find((asset) => asset.name === name) ?? null;
}

function formatLogValue(value) {
  if (typeof value === "string") return value;
  try { return JSON.stringify(toJsonSafe(value)); } catch { return String(value); }
}

function toJsonSafe(value) {
  if (value === undefined) return null;
  try { return JSON.parse(JSON.stringify(value)); } catch { return String(value); }
}
