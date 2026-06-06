// Session boundary keeps Agent Runtime Core inputs separate from pluggable capabilities and infrastructure services.
export function createRunnerSessionBoundary({ core = {}, capabilities = {}, infrastructure = {}, ...legacy } = {}) {
  return {
    core: {
      cwd: core.cwd ?? legacy.cwd,
      provider: core.provider ?? legacy.provider,
      modelId: core.modelId ?? legacy.modelId,
      modelRegistry: core.modelRegistry ?? legacy.modelRegistry,
      engine: core.engine ?? legacy.engine,
      ui: core.ui ?? legacy.ui,
      stateRoot: core.stateRoot ?? legacy.stateRoot ?? null,
      getCurrentModel: core.getCurrentModel ?? legacy.getCurrentModel ?? null,
      allowedToolNames: core.allowedToolNames ?? legacy.allowedToolNames ?? null,
    },
    capabilities: {
      memoryTools: capabilities.memoryTools ?? legacy.memoryTools ?? [],
      mcpTools: capabilities.mcpTools ?? legacy.mcpTools ?? [],
      webTools: capabilities.webTools ?? legacy.webTools ?? [],
      avatarRuntime: capabilities.avatarRuntime ?? legacy.avatarRuntime ?? null,
      imageModel: capabilities.imageModel ?? legacy.imageModel ?? null,
    },
    infrastructure: {
      historyStore: infrastructure.historyStore ?? legacy.historyStore ?? null,
      shellRuntime: infrastructure.shellRuntime ?? legacy.shellRuntime ?? null,
      lspService: infrastructure.lspService ?? legacy.lspService ?? null,
      lifecycle: infrastructure.lifecycle ?? legacy.lifecycle ?? null,
      authStorage: infrastructure.authStorage ?? legacy.authStorage ?? null,
      projectMarchDir: infrastructure.projectMarchDir ?? legacy.projectMarchDir ?? null,
    },
  };
}
