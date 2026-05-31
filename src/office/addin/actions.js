import { syncAndFormatShape } from "./scene.js";

// Action execution owns PowerPoint mutations. Keep taskpane.js as transport/dispatch only.
export function capabilities() {
  return [
    "powerpoint.observe",
    "powerpoint.actions:clearSlide",
    "powerpoint.actions:setSelectedText",
    "powerpoint.actions:insertTextBox",
    "powerpoint.actions:insertShape",
    "powerpoint.actions:insertImage",
    "powerpoint.actions:insertLine",
    "powerpoint.actions:patchShape",
    "powerpoint.actions:deleteShape",
    "powerpoint.actions:patchSelectedShape",
  ];
}

export async function applyPowerPointActions(actions) {
  const results = [];
  for (const action of actions) {
    results.push(await applyPowerPointAction(action));
  }
  return { ok: true, results };
}

async function applyPowerPointAction(action) {
  if (action.type === "clearSlide") return await clearSlide();
  if (action.type === "setSelectedText") return await setSelectedText(action.text ?? "");
  if (action.type === "insertTextBox") return await insertTextBox(action);
  if (action.type === "insertShape") return await insertShape(action);
  if (action.type === "insertImage") return await insertImage(action);
  if (action.type === "insertLine") return await insertLine(action);
  if (action.type === "patchShape") return await patchShape(action.target ?? {}, action.patch ?? {});
  if (action.type === "deleteShape") return await deleteShape(action.target ?? {});
  if (action.type === "patchSelectedShape") return await patchShape({ selected: true }, action.patch ?? {});
  throw new Error(`Unsupported PowerPoint action: ${action.type}`);
}

function setSelectedText(text) {
  return new Promise((resolve, reject) => {
    Office.context.document.setSelectedDataAsync(String(text), { coercionType: Office.CoercionType.Text }, (result) => {
      result.status === Office.AsyncResultStatus.Succeeded ? resolve({ ok: true }) : reject(new Error(result.error?.message || "Cannot set selected text"));
    });
  });
}

async function clearSlide() {
  return await PowerPoint.run(async (context) => {
    const slide = await selectedSlide(context);
    const shapes = slide.shapes;
    shapes.load("items/id,name,type,left,top,width,height");
    await context.sync();
    const deleted = shapes.items.map((shape) => ({ id: shape.id, name: shape.name, type: shape.type }));
    shapes.items.forEach((shape) => shape.delete());
    await context.sync();
    return { ok: true, deleted };
  });
}

async function insertTextBox(action) {
  return await PowerPoint.run(async (context) => {
    const slide = await selectedSlide(context);
    const shape = slide.shapes.addTextBox(String(action.text ?? ""), rectToAddOptions(action.rect ?? {}));
    applyCommonShapePatch(shape, action);
    return await syncAndFormatShape(context, shape);
  });
}

async function insertShape(action) {
  return await PowerPoint.run(async (context) => {
    const slide = await selectedSlide(context);
    const shape = slide.shapes.addGeometricShape(normalizeEnumValue(action.shapeType ?? "Rectangle"), rectToAddOptions(action.rect ?? {}));
    if (Object.hasOwn(action, "text")) shape.textFrame.textRange.text = String(action.text ?? "");
    applyCommonShapePatch(shape, action);
    return await syncAndFormatShape(context, shape);
  });
}

async function insertImage(action) {
  return await PowerPoint.run(async (context) => {
    const slide = await selectedSlide(context);
    const shape = slide.shapes.addPicture(normalizeImageBase64(action.source), rectToAddOptions(action.rect ?? {}));
    applyCommonShapePatch(shape, action);
    return await syncAndFormatShape(context, shape);
  });
}

async function insertLine(action) {
  return await PowerPoint.run(async (context) => {
    const slide = await selectedSlide(context);
    const shape = slide.shapes.addLine(normalizeEnumValue(action.connectorType ?? "Straight"), lineOptions(action));
    applyCommonShapePatch(shape, action);
    return await syncAndFormatShape(context, shape);
  });
}

async function patchShape(target, patch) {
  return await PowerPoint.run(async (context) => {
    const shape = await resolveShape(context, target);
    if (Object.hasOwn(patch, "text")) shape.textFrame.textRange.text = String(patch.text ?? "");
    applyCommonShapePatch(shape, patch);
    return await syncAndFormatShape(context, shape);
  });
}

async function deleteShape(target) {
  return await PowerPoint.run(async (context) => {
    const shape = await resolveShape(context, target);
    const deleted = (await syncAndFormatShape(context, shape)).shape;
    shape.delete();
    await context.sync();
    return { ok: true, deleted };
  });
}

async function selectedSlide(context) {
  const slides = context.presentation.getSelectedSlides();
  slides.load("items");
  await context.sync();
  const slide = slides.items[0];
  if (!slide) throw new Error("No selected slide");
  return slide;
}

async function resolveShape(context, target) {
  if (target.id) {
    const slide = await selectedSlide(context);
    const shape = slide.shapes.getItem(String(target.id));
    shape.load("id,name,type,left,top,width,height");
    await context.sync();
    return shape;
  }

  if (target.name) {
    const slide = await selectedSlide(context);
    const shapes = slide.shapes;
    shapes.load("items/id,name,type,left,top,width,height");
    await context.sync();
    const shape = shapes.items.find((item) => item.name === String(target.name));
    if (!shape) throw new Error(`No shape named ${target.name}`);
    return shape;
  }

  if (target.selected) {
    const shapes = context.presentation.getSelectedShapes();
    shapes.load("items/id,name,type,left,top,width,height");
    await context.sync();
    const shape = shapes.items[0];
    if (!shape) throw new Error("No selected shape");
    return shape;
  }

  throw new Error("Shape target must specify id, name, or selected");
}

function applyCommonShapePatch(shape, patch) {
  applyRect(shape, patch.rect ?? {});
  applyShapeName(shape, patch.name);
  applyRotation(shape, patch.rotation);
  applyShapeStyle(shape, patch.shapeStyle ?? {});
  applyTextStyle(shape, patch.textStyle ?? patch.style ?? {});
  applyZOrder(shape, patch.zOrder);
}

function lineOptions(action) {
  if (action.from && action.to) {
    return {
      left: action.from.x,
      top: action.from.y,
      width: action.to.x - action.from.x,
      height: action.to.y - action.from.y,
    };
  }
  return rectToAddOptions(action.rect ?? {});
}

function rectToAddOptions(rect) {
  return {
    left: rect.x ?? rect.left ?? 0,
    top: rect.y ?? rect.top ?? 0,
    width: rect.w ?? rect.width ?? 0,
    height: rect.h ?? rect.height ?? 0,
  };
}

function normalizeEnumValue(value) {
  return String(value).replace(/^[a-z]/, (char) => char.toUpperCase());
}

function applyShapeName(shape, name) {
  if (name) shape.name = String(name);
}

function applyRect(shape, rect) {
  if (Number.isFinite(rect.x ?? rect.left)) shape.left = rect.x ?? rect.left;
  if (Number.isFinite(rect.y ?? rect.top)) shape.top = rect.y ?? rect.top;
  if (Number.isFinite(rect.w ?? rect.width)) shape.width = rect.w ?? rect.width;
  if (Number.isFinite(rect.h ?? rect.height)) shape.height = rect.h ?? rect.height;
}

function applyRotation(shape, rotation) {
  if (Number.isFinite(rotation)) shape.rotation = rotation;
}

function applyShapeStyle(shape, style) {
  if (style.fillColor && shape.fill) shape.fill.setSolidColor(normalizeColor(style.fillColor));
  if (Number.isFinite(style.fillTransparency) && shape.fill) shape.fill.transparency = style.fillTransparency;

  const line = shape.lineFormat;
  if (!line) return;
  if (style.lineColor) line.color = normalizeColor(style.lineColor);
  if (Number.isFinite(style.lineWidth)) line.weight = style.lineWidth;
  if (Number.isFinite(style.lineTransparency)) line.transparency = style.lineTransparency;
  if (style.lineDash) line.dashStyle = normalizeEnumValue(style.lineDash);
}

function applyTextStyle(shape, style) {
  const font = shape.textFrame?.textRange?.font;
  if (!font) return;
  if (style.fontName) font.name = String(style.fontName);
  if (Number.isFinite(style.fontSize)) font.size = style.fontSize;
  if (typeof style.bold === "boolean") font.bold = style.bold;
  if (typeof style.italic === "boolean") font.italic = style.italic;
  if (style.color) font.color = normalizeColor(style.color);
}

function applyZOrder(shape, zOrder) {
  if (!zOrder) return;
  if (typeof shape.setZOrder !== "function") throw new Error("PowerPointApi 1.8 setZOrder is not available in this host");
  shape.setZOrder(normalizeEnumValue(zOrder));
}

function normalizeImageBase64(source = {}) {
  const value = source.base64 ?? source.dataUrl;
  if (!value) throw new Error("insertImage requires source.base64 or source.dataUrl");
  return String(value).replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "");
}

function normalizeColor(value) {
  return String(value).replace(/^#/, "");
}
