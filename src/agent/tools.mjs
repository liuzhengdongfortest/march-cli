import { createCommandExecTool } from "./command-exec-tool.mjs";
import { createCodeSearchTool } from "./code-search/tool.mjs";
import { createContextStatsTool } from "./context-stats-tool.mjs";
import { createEditFileTool } from "./file-edit-tool.mjs";
import { createReadFileTool } from "./file-tools/read-file-tool.mjs";
import { createReadImageTool } from "./file-tools/read-image-tool.mjs";
import { createSendBinaryTool } from "./output/send-binary-tool.mjs";
import { createScreenTool } from "./screen-tools/screen-tool.mjs";
import { createListWindowsTool } from "./screen-tools/list-windows-tool.mjs";
import { createShellTools } from "../shell/tools.mjs";
import { initImageGen } from "../image-gen/index.mjs";
import { createSuperGrokTool } from "../supergrok/tool.mjs";
import { createBrowserTools } from "../browser/tools/index.mjs";
import { createRuntimeRestartTool } from "./lifecycle/runtime-restart-tool.mjs";
import { createHistorySearchTool } from "../history/tool.mjs";

export function createMarchCustomTools({ cwd, engine, ui, memoryTools = [], historyStore = null, shellRuntime = null, lspService = null, mcpTools = [], webTools = [], lifecycle = null, authStorage = null, projectMarchDir = null, stateRoot = null, getCurrentModel = null }) {
  const commandExecTool = createCommandExecTool({ cwd });
  const codeSearchTool = createCodeSearchTool({ engine, stateRoot });
  const contextStatsTool = createContextStatsTool({ engine });
  const historySearchTool = createHistorySearchTool({ store: historyStore });
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
    codeSearchTool,
    commandExecTool,
    editFileTool,
    ...createShellTools(shellRuntime),
    ...(historySearchTool ? [historySearchTool] : []),
    ...memoryTools,
    ...mcpTools,
    ...webTools,
    ...(lifecycle ? [createRuntimeRestartTool({ lifecycle })] : []),
    ...createBrowserTools({ stateRoot }),
    ...(authStorage ? [createSuperGrokTool({ authStorage, projectMarchDir })] : []),
    ...(authStorage ? initImageGen({ authStorage, projectMarchDir }) : []),
  ];
  return tools;
}
