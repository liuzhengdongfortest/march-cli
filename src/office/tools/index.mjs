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
    description: "Apply structured PowerPoint actions through the connected Office add-in. Prefer semantic/layout actions over raw coordinates when possible.",
    parameters: Type.Object({
      actions: Type.Array(Type.Object({}, { additionalProperties: true }), { description: "Ordered PowerPoint action objects." }),
    }),
    execute: async (_id, params = {}) => safeToolJson(() => callOfficeDaemon({ stateRoot, method: "powerpoint.actions", params, timeoutMs: 60000 })),
  });
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
