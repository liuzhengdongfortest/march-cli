import { createCommandExecTool } from "./command-exec-tool.mjs";
import { createContextStatsTool } from "./context-stats-tool.mjs";
import { createEditFileTool } from "./file-edit-tool.mjs";
import { createReadFileTool } from "./file-tools/read-file-tool.mjs";
import { createReadImageTool } from "./file-tools/read-image-tool.mjs";
import { createSendBinaryTool } from "./output/send-binary-tool.mjs";
import { createScreenTool } from "./screen-tools/screen-tool.mjs";
import { createListWindowsTool } from "./screen-tools/list-windows-tool.mjs";
import { toolText } from "./tool-result.mjs";
import { createShellTools } from "../shell/tools.mjs";
import { initImageGen } from "../image-gen/index.mjs";
import { createSuperGrokTool } from "../supergrok/tool.mjs";
import { createBrowserTools } from "../browser/tools/index.mjs";

export function createMarchCustomTools({ cwd, engine, ui, memoryTools = [], shellRuntime = null, lspService = null, mcpTools = [], webTools = [], permissionController = null, authStorage = null, projectMarchDir = null, stateRoot = null, getCurrentModel = null }) {
  const commandExecTool = createCommandExecTool({ cwd });
  const contextStatsTool = createContextStatsTool({ engine });
  const editFileTool = createEditFileTool({ engine, ui, lspService });
  const readFileTool = createReadFileTool({ engine });
  const readImageTool = createReadImageTool({ engine, getCurrentModel });
  const sendBinaryTool = createSendBinaryTool({ engine });
  const screenTool = createScreenTool({ getCurrentModel });
  const listWindowsTool = createListWindowsTool();

  const tools = [
    readFileTool,
    readImageTool,
    sendBinaryTool,
    screenTool,
    listWindowsTool,
    contextStatsTool,
    commandExecTool,
    editFileTool,
    ...createShellTools(shellRuntime),
    ...memoryTools,
    ...mcpTools,
    ...webTools,
    ...createBrowserTools({ stateRoot }),
    ...(authStorage ? [createSuperGrokTool({ authStorage, projectMarchDir })] : []),
    ...(authStorage ? initImageGen({ authStorage, projectMarchDir }) : []),
  ];

  if (!permissionController) return tools;

  return tools.map((tool) => {
    const execute = tool.execute;
    if (!execute) return tool;
    const wrapped = async (toolCallId, params, signal, onUpdate) => {
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
      return execute(toolCallId, params, signal, onUpdate);
    };
    return { ...tool, execute: wrapped };
  });
}
