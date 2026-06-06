import { createBrowserTools } from "../../../browser/tools/index.mjs";
import { initImageGen } from "../../../image-gen/index.mjs";
import { createShellTools } from "../../../shell/tools.mjs";
import { createSuperGrokTool } from "../../../supergrok/tool.mjs";

export const EXTERNAL_TOOL_CAPABILITY_PROVIDERS = [
  {
    id: "shell",
    toolNames: ["terminal_spawn", "terminal_send", "terminal_list", "terminal_kill", "terminal_resize", "terminal_clear", "terminal_search", "terminal_read", "terminal_snapshot"],
    createTools: createShellToolCapability,
  },
  {
    id: "web",
    toolNames: null,
    createTools: createWebToolCapability,
  },
  {
    id: "browser",
    toolNames: ["browser_tabs", "browser_open", "browser_read", "browser_script", "browser_screenshot"],
    createTools: createBrowserToolCapability,
  },
  {
    id: "auth",
    toolNames: ["supergrok", "image_generate"],
    createTools: createAuthToolCapability,
  },
];

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

function createAuthToolCapability(boundary) {
  const { authStorage, projectMarchDir } = boundary.infrastructure;
  if (!authStorage) return [];
  return [
    createSuperGrokTool({ authStorage, projectMarchDir }),
    ...initImageGen({ authStorage, projectMarchDir }),
  ];
}
