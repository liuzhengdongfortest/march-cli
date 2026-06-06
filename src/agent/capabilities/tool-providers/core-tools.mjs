import { createCommandExecTool } from "../../command-exec-tool.mjs";
import { createCodeSearchTool } from "../../code-search/tool.mjs";
import { createContextStatsTool } from "../../context-stats-tool.mjs";
import { createEditFileTool } from "../../file-edit-tool.mjs";
import { createReadFileTool } from "../../file-tools/read-file-tool.mjs";
import { createReadImageTool } from "../../file-tools/read-image-tool.mjs";
import { createRuntimeRestartTool } from "../../lifecycle/runtime-restart-tool.mjs";
import { createSendBinaryTool } from "../../output/send-binary-tool.mjs";
import { createListWindowsTool } from "../../screen-tools/list-windows-tool.mjs";
import { createScreenTool } from "../../screen-tools/screen-tool.mjs";
import { createAnalyzeImagesTool } from "../../vision-tools/analyze-images-tool.mjs";
import { createHistorySearchTool } from "../../../history/tool.mjs";

export const CORE_TOOL_CAPABILITY_PROVIDERS = [
  {
    id: "coding",
    toolNames: ["read", "read_image", "send_binary", "screen", "list_windows", "analyze_images", "context_stats", "code_search", "command_exec", "edit_file"],
    createTools: createCodingToolCapability,
  },
  {
    id: "runtime",
    toolNames: ["request_runtime_restart"],
    createTools: createRuntimeToolCapability,
  },
  {
    id: "memory",
    toolNames: null,
    createTools: createMemoryToolCapability,
  },
];

function createCodingToolCapability(boundary) {
  const { cwd, engine, ui, stateRoot, getCurrentModel, modelRegistry } = boundary.core;
  const { lspService } = boundary.infrastructure;
  const { imageModel } = boundary.capabilities;
  return [
    createReadFileTool({ engine }),
    createReadImageTool({ engine, getCurrentModel }),
    createSendBinaryTool({ engine }),
    createScreenTool({ getCurrentModel }),
    createListWindowsTool(),
    createAnalyzeImagesTool({ engine, modelRegistry, imageModel }),
    createContextStatsTool({ engine }),
    createCodeSearchTool({ engine, stateRoot }),
    createCommandExecTool({ cwd }),
    createEditFileTool({ engine, ui, lspService }),
  ];
}

function createRuntimeToolCapability(boundary) {
  const { lifecycle } = boundary.infrastructure;
  return lifecycle ? [createRuntimeRestartTool({ lifecycle })] : [];
}

function createMemoryToolCapability(boundary) {
  const { historyStore } = boundary.infrastructure;
  const historySearchTool = createHistorySearchTool({ store: historyStore });
  return [
    ...(historySearchTool ? [historySearchTool] : []),
    ...boundary.capabilities.memoryTools,
  ];
}
