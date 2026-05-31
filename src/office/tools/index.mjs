import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { toolText } from "../../agent/tool-result.mjs";
import { callOfficeDaemon } from "../client/rpc.mjs";

export function createOfficeTools({ stateRoot = join(homedir(), ".march") } = {}) {
  return [officeStatusTool(stateRoot), officeObserveTool(stateRoot), officeActionTool(stateRoot)];
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

function officeActionTool(stateRoot) {
  return defineTool({
    name: "powerpoint_action",
    label: "PowerPoint Action",
    description: "Apply structured PowerPoint actions through the connected Office add-in. Use rect {x,y,w,h}; target existing shapes by id, name, or selected.",
    parameters: Type.Object({
      actions: Type.Array(PowerPointAction, { description: "Ordered PowerPoint action objects." }),
    }),
    execute: async (_id, params = {}) => safeToolJson(async () => callOfficeDaemon({
      stateRoot,
      method: "powerpoint.actions",
      params: { ...params, actions: await normalizePowerPointActions(params.actions ?? []) },
      timeoutMs: 60000,
    })),
  });
}

const Rect = Type.Object({
  x: Type.Optional(Type.Number()),
  y: Type.Optional(Type.Number()),
  w: Type.Optional(Type.Number()),
  h: Type.Optional(Type.Number()),
  left: Type.Optional(Type.Number()),
  top: Type.Optional(Type.Number()),
  width: Type.Optional(Type.Number()),
  height: Type.Optional(Type.Number()),
}, { additionalProperties: false, description: "Shape rectangle in slide points. Prefer x/y/w/h; left/top/width/height are accepted aliases." });

const Point = Type.Object({
  x: Type.Number(),
  y: Type.Number(),
}, { additionalProperties: false });

const TextStyle = Type.Object({
  fontName: Type.Optional(Type.String()),
  fontSize: Type.Optional(Type.Number()),
  color: Type.Optional(Type.String()),
  bold: Type.Optional(Type.Boolean()),
  italic: Type.Optional(Type.Boolean()),
}, { additionalProperties: false });

const ShapeStyle = Type.Object({
  fillColor: Type.Optional(Type.String()),
  fillTransparency: Type.Optional(Type.Number()),
  lineColor: Type.Optional(Type.String()),
  lineWidth: Type.Optional(Type.Number()),
  lineTransparency: Type.Optional(Type.Number()),
  lineDash: Type.Optional(Type.String()),
}, { additionalProperties: false });

const ImageSource = Type.Object({
  base64: Type.Optional(Type.String()),
  dataUrl: Type.Optional(Type.String()),
  path: Type.Optional(Type.String()),
}, { additionalProperties: false, description: "Image source. Local path is read by March and sent to the add-in as base64." });

const ZOrder = Type.Union([
  Type.Literal("BringForward"),
  Type.Literal("BringToFront"),
  Type.Literal("SendBackward"),
  Type.Literal("SendToBack"),
]);

const ShapeTarget = Type.Object({
  id: Type.Optional(Type.String()),
  name: Type.Optional(Type.String()),
  selected: Type.Optional(Type.Boolean()),
}, { additionalProperties: false, description: "Exactly one of id, name, or selected should identify the shape." });

const ShapePatch = Type.Object({
  rect: Type.Optional(Rect),
  name: Type.Optional(Type.String()),
  text: Type.Optional(Type.String()),
  textStyle: Type.Optional(TextStyle),
  shapeStyle: Type.Optional(ShapeStyle),
  style: Type.Optional(TextStyle),
  rotation: Type.Optional(Type.Number()),
  zOrder: Type.Optional(ZOrder),
}, { additionalProperties: false, description: "Patch for an existing shape. style is a legacy alias for textStyle." });

const PowerPointAction = Type.Union([
  Type.Object({
    type: Type.Literal("clearSlide"),
  }, { additionalProperties: false }),
  Type.Object({
    type: Type.Literal("setSelectedText"),
    text: Type.String(),
  }, { additionalProperties: false }),
  Type.Object({
    type: Type.Literal("insertTextBox"),
    text: Type.Optional(Type.String()),
    rect: Type.Optional(Rect),
    name: Type.Optional(Type.String()),
    textStyle: Type.Optional(TextStyle),
    shapeStyle: Type.Optional(ShapeStyle),
    style: Type.Optional(TextStyle),
    rotation: Type.Optional(Type.Number()),
    zOrder: Type.Optional(ZOrder),
  }, { additionalProperties: false }),
  Type.Object({
    type: Type.Literal("insertShape"),
    shapeType: Type.Optional(Type.String({ description: "PowerPoint geometric shape type, e.g. Rectangle, RoundRectangle, Ellipse, Chevron." })),
    text: Type.Optional(Type.String()),
    rect: Type.Optional(Rect),
    name: Type.Optional(Type.String()),
    textStyle: Type.Optional(TextStyle),
    shapeStyle: Type.Optional(ShapeStyle),
    rotation: Type.Optional(Type.Number()),
    zOrder: Type.Optional(ZOrder),
  }, { additionalProperties: false }),
  Type.Object({
    type: Type.Literal("insertImage"),
    source: ImageSource,
    rect: Type.Optional(Rect),
    name: Type.Optional(Type.String()),
    rotation: Type.Optional(Type.Number()),
    zOrder: Type.Optional(ZOrder),
  }, { additionalProperties: false }),
  Type.Object({
    type: Type.Literal("insertLine"),
    connectorType: Type.Optional(Type.String({ description: "PowerPoint connector type, e.g. Straight, Elbow, Curve." })),
    from: Type.Optional(Point),
    to: Type.Optional(Point),
    rect: Type.Optional(Rect),
    name: Type.Optional(Type.String()),
    shapeStyle: Type.Optional(ShapeStyle),
    rotation: Type.Optional(Type.Number()),
    zOrder: Type.Optional(ZOrder),
  }, { additionalProperties: false }),
  Type.Object({
    type: Type.Literal("patchShape"),
    target: ShapeTarget,
    patch: ShapePatch,
  }, { additionalProperties: false }),
  Type.Object({
    type: Type.Literal("patchSelectedShape"),
    patch: ShapePatch,
  }, { additionalProperties: false, description: "Legacy compatibility action. Prefer patchShape with an explicit target." }),
  Type.Object({
    type: Type.Literal("deleteShape"),
    target: ShapeTarget,
  }, { additionalProperties: false }),
]);

async function normalizePowerPointActions(actions) {
  return await Promise.all(actions.map(normalizePowerPointAction));
}

async function normalizePowerPointAction(action) {
  if (action?.type !== "insertImage" || !action.source?.path) return action;
  const base64 = await readFile(action.source.path, "base64");
  return { ...action, source: { ...action.source, path: undefined, base64 } };
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
