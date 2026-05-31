const DAEMON_WS = "ws://127.0.0.1:4330/addin";
const statusEl = document.getElementById("status");
const hostEl = document.getElementById("host");
let socket = null;
let officeInfo = { host: "unknown", platform: "unknown" };

Office.onReady((info) => {
  officeInfo = { host: info.host, platform: info.platform };
  hostEl.textContent = `${info.host ?? "unknown"} ${info.platform ?? ""}`.trim();
  connect();
});

function connect() {
  setStatus("connecting");
  socket = new WebSocket(DAEMON_WS);
  socket.onopen = () => {
    setStatus("connected");
    send({ type: "hello", info: officeInfo });
  };
  socket.onmessage = (event) => handleMessage(event.data);
  socket.onclose = () => {
    setStatus("disconnected");
    setTimeout(connect, 1000);
  };
  socket.onerror = () => socket?.close();
}

async function handleMessage(data) {
  const request = JSON.parse(data);
  if (!request.id) return;
  try {
    const result = await dispatch(request.method, request.params ?? {});
    send({ id: request.id, ok: true, result });
  } catch (err) {
    send({ id: request.id, ok: false, error: serializeError(err) });
  }
}

async function dispatch(method, params) {
  if (method === "status") return { ok: true, addin: officeInfo, capabilities: capabilities() };
  if (method === "powerpoint.observe") return await observePowerPoint(params);
  if (method === "powerpoint.actions") return await applyPowerPointActions(params.actions ?? []);
  throw new Error(`Unknown Office method: ${method}`);
}

function capabilities() {
  return [
    "powerpoint.observe",
    "powerpoint.actions:setSelectedText",
    "powerpoint.actions:insertTextBox",
    "powerpoint.actions:insertShape",
    "powerpoint.actions:insertLine",
    "powerpoint.actions:patchShape",
    "powerpoint.actions:deleteShape",
    "powerpoint.actions:patchSelectedShape",
  ];
}

async function observePowerPoint({ scope = "slide" } = {}) {
  const selectionText = await getSelectedText().catch((err) => ({ error: err.message }));
  const slideScene = scope === "selection" ? null : await getCurrentSlideScene().catch((err) => ({ error: err.message }));
  return {
    host: officeInfo,
    scope,
    selection: typeof selectionText === "string" ? { text: selectionText } : selectionText,
    slide: slideScene,
  };
}

async function applyPowerPointActions(actions) {
  const results = [];
  for (const action of actions) {
    results.push(await applyPowerPointAction(action));
  }
  return { ok: true, results };
}

async function applyPowerPointAction(action) {
  if (action.type === "setSelectedText") return await setSelectedText(action.text ?? "");
  if (action.type === "insertTextBox") return await insertTextBox(action);
  if (action.type === "insertShape") return await insertShape(action);
  if (action.type === "insertLine") return await insertLine(action);
  if (action.type === "patchShape") return await patchShape(action.target ?? {}, action.patch ?? {});
  if (action.type === "deleteShape") return await deleteShape(action.target ?? {});
  if (action.type === "patchSelectedShape") return await patchShape({ selected: true }, action.patch ?? {});
  throw new Error(`Unsupported PowerPoint action: ${action.type}`);
}

function getSelectedText() {
  return new Promise((resolve, reject) => {
    Office.context.document.getSelectedDataAsync(Office.CoercionType.Text, (result) => {
      result.status === Office.AsyncResultStatus.Succeeded ? resolve(result.value ?? "") : reject(new Error(result.error?.message || "Cannot read selected text"));
    });
  });
}

function setSelectedText(text) {
  return new Promise((resolve, reject) => {
    Office.context.document.setSelectedDataAsync(String(text), { coercionType: Office.CoercionType.Text }, (result) => {
      result.status === Office.AsyncResultStatus.Succeeded ? resolve({ ok: true }) : reject(new Error(result.error?.message || "Cannot set selected text"));
    });
  });
}

async function getCurrentSlideScene() {
  return await PowerPoint.run(async (context) => {
    const slides = context.presentation.getSelectedSlides();
    slides.load("items/id");
    await context.sync();
    const slide = slides.items[0];
    if (!slide) return { objects: [], warning: "No selected slide" };
    const shapes = slide.shapes;
    shapes.load("items/id,name,type,left,top,width,height");
    await context.sync();
    return { id: slide.id, objects: shapes.items.map(formatShape) };
  });
}

async function insertTextBox(action) {
  return await PowerPoint.run(async (context) => {
    const slide = await selectedSlide(context);
    const shape = slide.shapes.addTextBox(String(action.text ?? ""));
    applyRect(shape, action.rect ?? {});
    applyShapeName(shape, action.name);
    applyShapeStyle(shape, action.shapeStyle ?? {});
    applyTextStyle(shape, action.textStyle ?? action.style ?? {});
    return await syncAndFormatShape(context, shape);
  });
}

async function insertShape(action) {
  return await PowerPoint.run(async (context) => {
    const slide = await selectedSlide(context);
    const shape = slide.shapes.addGeometricShape(normalizeEnumValue(action.shapeType ?? "Rectangle"));
    applyRect(shape, action.rect ?? {});
    applyShapeName(shape, action.name);
    if (Object.hasOwn(action, "text")) shape.textFrame.textRange.text = String(action.text ?? "");
    applyShapeStyle(shape, action.shapeStyle ?? {});
    applyTextStyle(shape, action.textStyle ?? {});
    return await syncAndFormatShape(context, shape);
  });
}

async function insertLine(action) {
  return await PowerPoint.run(async (context) => {
    const slide = await selectedSlide(context);
    const shape = slide.shapes.addLine(normalizeEnumValue(action.connectorType ?? "Straight"), lineOptions(action));
    applyShapeName(shape, action.name);
    applyShapeStyle(shape, action.shapeStyle ?? {});
    return await syncAndFormatShape(context, shape);
  });
}

async function patchShape(target, patch) {
  return await PowerPoint.run(async (context) => {
    const shape = await resolveShape(context, target);
    applyRect(shape, patch.rect ?? {});
    applyShapeName(shape, patch.name);
    if (Object.hasOwn(patch, "text")) shape.textFrame.textRange.text = String(patch.text ?? "");
    applyShapeStyle(shape, patch.shapeStyle ?? {});
    applyTextStyle(shape, patch.textStyle ?? patch.style ?? {});
    return await syncAndFormatShape(context, shape);
  });
}

async function deleteShape(target) {
  return await PowerPoint.run(async (context) => {
    const shape = await resolveShape(context, target);
    shape.load("id,name,type,left,top,width,height");
    await context.sync();
    const deleted = formatShape(shape);
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

function normalizeColor(value) {
  return String(value).replace(/^#/, "");
}

async function syncAndFormatShape(context, shape) {
  shape.load("id,name,type,left,top,width,height");
  await context.sync();
  return { ok: true, shape: formatShape(shape) };
}

function formatShape(shape) {
  return {
    id: shape.id,
    name: shape.name,
    type: shape.type,
    rect: { x: shape.left, y: shape.top, w: shape.width, h: shape.height },
  };
}

function send(payload) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
}

function setStatus(value) {
  statusEl.textContent = value;
  statusEl.className = `status ${value}`;
}

function serializeError(err) {
  return { message: err?.message ?? String(err), stack: err?.stack };
}
