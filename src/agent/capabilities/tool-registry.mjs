import { createCommandExecTool } from "../command-exec-tool.mjs";
import { createCodeSearchTool } from "../code-search/tool.mjs";
import { createContextStatsTool } from "../context-stats-tool.mjs";
import { createEditFileTool } from "../file-edit-tool.mjs";
import { createReadFileTool } from "../file-tools/read-file-tool.mjs";
import { createReadImageTool } from "../file-tools/read-image-tool.mjs";
import { createRuntimeRestartTool } from "../lifecycle/runtime-restart-tool.mjs";
import { createSendBinaryTool } from "../output/send-binary-tool.mjs";
import { createListWindowsTool } from "../screen-tools/list-windows-tool.mjs";
import { createScreenTool } from "../screen-tools/screen-tool.mjs";
import { createAvatarTools } from "../avatars/tools.mjs";
import { createAnalyzeImagesTool } from "../vision-tools/analyze-images-tool.mjs";
import { createBrowserTools } from "../../browser/tools/index.mjs";
import { createHistorySearchTool } from "../../history/tool.mjs";
import { initImageGen } from "../../image-gen/index.mjs";
import { createOfficeTools } from "../../office/tools/index.mjs";
import { createShellTools } from "../../shell/tools.mjs";
import { createSuperGrokTool } from "../../supergrok/tool.mjs";

// Capability providers are the only place where tool families attach to a session boundary.
// Keep Agent Runtime Core out of individual provider wiring decisions.
const TOOL_CAPABILITY_PROVIDERS = [
  createCodingToolCapability,
  createRuntimeToolCapability,
  createMemoryToolCapability,
  createShellToolCapability,
  createWebToolCapability,
  createBrowserToolCapability,
  createOfficeToolCapability,
  createAuthToolCapability,
  createAvatarToolCapability,
];

export function createToolsFromCapabilities(boundary) {
  return TOOL_CAPABILITY_PROVIDERS.flatMap((provider) => provider(boundary));
}

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

function createShellToolCapability(boundary) {
  return createShellTools(boundary.infrastructure.shellRuntime);
}

function createWebToolCapability(boundary) {
  return [
    ...boundary.capabilities.mcpTools,
    ...boundary.capabilities.webTools,
  ];
}

function createBrowserToolCapability(boundary) {
  const { stateRoot, getCurrentModel } = boundary.core;
  return createBrowserTools({ stateRoot: stateRoot ?? undefined, getCurrentModel });
}

function createOfficeToolCapability(boundary) {
  const { stateRoot } = boundary.core;
  return createOfficeTools({ stateRoot: stateRoot ?? undefined });
}

function createAuthToolCapability(boundary) {
  const { authStorage, projectMarchDir } = boundary.infrastructure;
  if (!authStorage) return [];
  return [
    createSuperGrokTool({ authStorage, projectMarchDir }),
    ...initImageGen({ authStorage, projectMarchDir }),
  ];
}

function createAvatarToolCapability(boundary) {
  const { avatarRuntime } = boundary.capabilities;
  return avatarRuntime ? createAvatarTools({ runtime: avatarRuntime }) : [];
}
