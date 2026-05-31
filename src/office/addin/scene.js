// Scene observation owns the PowerPoint read model. JS execution stays in executor.js.
const observedTextFrames = new WeakMap();

export async function getCurrentSlideScene() {
  return await PowerPoint.run(async (context) => {
    const slides = context.presentation.getSelectedSlides();
    slides.load("items/id");
    await context.sync();

    const slide = slides.items[0];
    if (!slide) return { objects: [], warning: "No selected slide" };

    const slideSize = await readSlideSize(context);
    const shapes = slide.shapes;
    shapes.load("items/id,name,type,left,top,width,height,rotation,visible,zOrderPosition");
    await context.sync();

    await loadShapeStyles(context, shapes.items);
    await loadShapeText(context, shapes.items);

    return { id: slide.id, size: slideSize, objects: shapes.items.map(formatShape) };
  });
}

async function readSlideSize(context) {
  if (!Office.context.requirements?.isSetSupported?.("PowerPointApi", "1.10")) return null;
  const pageSetup = context.presentation.pageSetup;
  pageSetup.load("slideWidth,slideHeight");
  await context.sync();
  return { w: pageSetup.slideWidth, h: pageSetup.slideHeight };
}

async function loadShapeStyles(context, shapes) {
  for (const shape of shapes) {
    shape.fill?.load("type,foregroundColor,transparency");
    shape.lineFormat?.load("color,weight,transparency,dashStyle");
  }
  await context.sync();
}

async function loadShapeText(context, shapes) {
  const candidates = [];
  for (const shape of shapes) {
    const textFrame = textFrameFor(shape);
    if (!textFrame) continue;
    textFrame.load("isNullObject");
    candidates.push({ shape, textFrame });
  }
  await context.sync();

  for (const { shape, textFrame } of candidates) {
    if (textFrame.isNullObject) continue;
    observedTextFrames.set(shape, textFrame);
    textFrame.load("textRange/text,textRange/font/name,textRange/font/size,textRange/font/color,textRange/font/bold,textRange/font/italic");
  }
  await context.sync();
}

export async function syncAndFormatShape(context, shape) {
  shape.load("id,name,type,left,top,width,height,rotation,visible,zOrderPosition");
  await context.sync();
  await loadShapeStyles(context, [shape]);
  await loadShapeText(context, [shape]);
  return { ok: true, shape: formatShape(shape) };
}

export function formatShape(shape) {
  return withoutEmpty({
    id: shape.id,
    name: shape.name,
    type: shape.type,
    rect: { x: shape.left, y: shape.top, w: shape.width, h: shape.height },
    rotation: shape.rotation,
    visible: shape.visible,
    zOrder: shape.zOrderPosition,
    text: formatText(observedTextFrames.get(shape)),
    shapeStyle: formatShapeStyle(shape),
  });
}

function formatText(textFrame) {
  if (!textFrame || textFrame.isNullObject) return undefined;
  const font = textFrame.textRange?.font;
  return withoutEmpty({
    content: textFrame.textRange?.text,
    style: font ? withoutEmpty({
      fontName: font.name,
      fontSize: font.size,
      color: normalizeObservedColor(font.color),
      bold: font.bold,
      italic: font.italic,
    }) : undefined,
  });
}

function formatShapeStyle(shape) {
  return withoutEmpty({
    fillType: shape.fill?.type,
    fillColor: normalizeObservedColor(shape.fill?.foregroundColor),
    fillTransparency: shape.fill?.transparency,
    lineColor: normalizeObservedColor(shape.lineFormat?.color),
    lineWidth: shape.lineFormat?.weight,
    lineTransparency: shape.lineFormat?.transparency,
    lineDash: shape.lineFormat?.dashStyle,
  });
}

function normalizeObservedColor(value) {
  if (!value) return undefined;
  const text = String(value);
  return text.startsWith("#") ? text : `#${text}`;
}

function textFrameFor(shape) {
  if (shape.getTextFrameOrNullObject) return shape.getTextFrameOrNullObject();
  if (/line/i.test(String(shape.type))) return null;
  try {
    return shape.textFrame;
  } catch {
    return null;
  }
}

function withoutEmpty(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined && entry !== null && entry !== ""));
}