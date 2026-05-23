import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { toolText } from "../tool-result.mjs";

export function createRuntimeRestartTool({ lifecycle }) {
  return defineTool({
    name: "request_runtime_restart",
    label: "Request Runtime Restart",
    description: "Request March to restart the runtime after the current turn so the next turn loads updated runner/tool code from disk.",
    parameters: Type.Object({
      reason: Type.Optional(Type.String({ description: "Why the runtime needs to restart" })),
    }),
    execute: async (_toolCallId, params = {}) => {
      const reason = String(params.reason ?? "").trim();
      lifecycle?.requestRuntimeRestart?.({ reason });
      return toolText(
        "March runtime restart requested. The current turn will finish first; the next turn will use the latest code from disk.",
        { lifecycleAction: { type: "restart_runtime", reason } },
      );
    },
  });
}
