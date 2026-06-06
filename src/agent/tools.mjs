import { createCommandExecTool } from "./command-exec-tool.mjs";
import { createCodeSearchTool } from "./code-search/tool.mjs";
import { createContextStatsTool } from "./context-stats-tool.mjs";
import { createEditFileTool } from "./file-edit-tool.mjs";
import { createReadFileTool } from "./file-tools/read-file-tool.mjs";
import { createReadImageTool } from "./file-tools/read-image-tool.mjs";
import { createSendBinaryTool } from "./output/send-binary-tool.mjs";
import { createScreenTool } from "./screen-tools/screen-tool.mjs";
import { createListWindowsTool } from "./screen-tools/list-windows-tool.mjs";
import { createAnalyzeImagesTool } from "./vision-tools/analyze-images-tool.mjs";
import { createShellTools } from "../shell/tools.mjs";
import { initImageGen } from "../image-gen/index.mjs";
import { createSuperGrokTool } from "../supergrok/tool.mjs";
import { createBrowserTools } from "../browser/tools/index.mjs";
import { createOfficeTools } from "../office/tools/index.mjs";
import { createRuntimeRestartTool } from "./lifecycle/runtime-restart-tool.mjs";
import { createHistorySearchTool } from "../history/tool.mjs";
import { createAvatarTools } from "./avatars/tools.mjs";
import { createRunnerSessionBoundary } from "./session/session-boundary.mjs";

export function createMarchCustomTools(options = {}) {
  const boundary = createRunnerSessionBoundary(options);
  const { cwd, engine, ui, stateRoot, getCurrentModel, modelRegistry } = boundary.core;
  const { memoryTools, mcpTools, webTools, avatarRuntime, imageModel } = boundary.capabilities;
  const { historyStore, shellRuntime, lspService, lifecycle, authStorage, projectMarchDir } = boundary.infrastructure;
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
  const analyzeImagesTool = createAnalyzeImagesTool({ engine, modelRegistry, imageModel });

  const tools = [
    readFileTool,
    readImageTool,
    sendBinaryTool,
    screenTool,
    listWindowsTool,
    analyzeImagesTool,
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
    ...createBrowserTools({ stateRoot, getCurrentModel }),
    ...createOfficeTools({ stateRoot }),
    ...(authStorage ? [createSuperGrokTool({ authStorage, projectMarchDir })] : []),
    ...(authStorage ? initImageGen({ authStorage, projectMarchDir }) : []),
    ...(avatarRuntime ? createAvatarTools({ runtime: avatarRuntime }) : []),
  ];
  return tools;
}
