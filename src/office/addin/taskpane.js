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
  if (action.type === "patchSelectedShape") return await patchSelectedShape(action.patch ?? {});
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
    if (action.name) shape.name = String(action.name);
    applyTextStyle(shape, action.style ?? {});
    shape.load("id,name,type,left,top,width,height");
    await context.sync();
    return { ok: true, shape: formatShape(shape) };
  });
}

async function patchSelectedShape(patch) {
  return await PowerPoint.run(async (context) => {
    const shapes = context.presentation.getSelectedShapes();
    shapes.load("items/id,name,type,left,top,width,height");
    await context.sync();
    const shape = shapes.items[0];
    if (!shape) throw new Error("No selected shape");
    applyRect(shape, patch.rect ?? patch);
    if (patch.name) shape.name = String(patch.name);
    if (Object.hasOwn(patch, "text")) shape.textFrame.textRange.text = String(patch.text);
    applyTextStyle(shape, patch.style ?? {});
    await context.sync();
    return { ok: true, shape: formatShape(shape) };
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

function applyRect(shape, rect) {
  if (Number.isFinite(rect.x ?? rect.left)) shape.left = rect.x ?? rect.left;
  if (Number.isFinite(rect.y ?? rect.top)) shape.top = rect.y ?? rect.top;
  if (Number.isFinite(rect.w ?? rect.width)) shape.width = rect.w ?? rect.width;
  if (Number.isFinite(rect.h ?? rect.height)) shape.height = rect.h ?? rect.height;
}

function applyTextStyle(shape, style) {
  const font = shape.textFrame?.textRange?.font;
  if (!font) return;
  if (style.fontName) font.name = String(style.fontName);
  if (Number.isFinite(style.fontSize)) font.size = style.fontSize;
  if (typeof style.bold === "boolean") font.bold = style.bold;
  if (typeof style.italic === "boolean") font.italic = style.italic;
  if (style.color) font.color = String(style.color).replace(/^#/, "");
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
