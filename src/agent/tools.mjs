import { defineTool } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import { createCommandExecTool } from "./command-exec-tool.mjs";
import { createContextStatsTool } from "./context-stats-tool.mjs";
import { createEditFileTool } from "./file-edit-tool.mjs";
import { createFindTool } from "./find-tool.mjs";
import { createReadFileTool } from "./read-file-tool.mjs";
import { toolText } from "./tool-result.mjs";
import { createShellTools } from "../shell/tools.mjs";
import { createWebTools } from "../web/tools.mjs";
export function createMarchCustomTools({ cwd, engine, ui, memoryTools = [], shellRuntime = null, lspService = null, mcpTools = [], webTools = [], permissionController = null }) {
  const commandExecTool = createCommandExecTool({ cwd });
  const contextStatsTool = createContextStatsTool({ engine });
  const editFileTool = createEditFileTool({ engine, ui, lspService });
  const findTool = createFindTool({ cwd });
  const readFileTool = createReadFileTool({ engine });

  const tools = [
    readFileTool,
    contextStatsTool,
    commandExecTool,
    editFileTool,
    findTool,
    ...createShellTools(shellRuntime),
    ...memoryTools,
    ...mcpTools,
    ...webTools,
  ];

  if (!permissionController) return tools;

  return tools.map((tool) => {
    const execute = tool.execute;
    if (!execute) return tool;
    const wrapped = async (toolCallId, params) => {
      const decision = await permissionController.requestApproval(
        tool.name,
        params,
        ui.requestPermission
          ? (ctx) => ui.requestPermission(ctx)
          : null,
      );
      if (decision.behavior === "deny") {
        return toolText(`Permission denied: ${decision.message}`, { error: true, permissionDenied: true });
      }
      return execute(toolCallId, params);
    };
    return { ...tool, execute: wrapped };
  });
}
