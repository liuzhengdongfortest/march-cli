// Session boundary keeps Agent Runtime Core inputs separate from pluggable capabilities and infrastructure services.
export function createRunnerSessionBoundary(input = {}) {
  assertSessionBoundaryShape(input);
  const { core = {}, capabilities = {}, infrastructure = {} } = input;
  return {
    core: {
      cwd: core.cwd,
      provider: core.provider,
      modelId: core.modelId,
      modelRegistry: core.modelRegistry,
      engine: core.engine,
      ui: core.ui,
      stateRoot: core.stateRoot ?? null,
      getCurrentModel: core.getCurrentModel ?? null,
      allowedToolNames: core.allowedToolNames ?? null,
    },
    capabilities: {
      memoryTools: capabilities.memoryTools ?? [],
      mcpTools: capabilities.mcpTools ?? [],
      webTools: capabilities.webTools ?? [],
      avatarRuntime: capabilities.avatarRuntime ?? null,
      imageModel: capabilities.imageModel ?? null,
    },
    infrastructure: {
      historyStore: infrastructure.historyStore ?? null,
      shellRuntime: infrastructure.shellRuntime ?? null,
      lspService: infrastructure.lspService ?? null,
      lifecycle: infrastructure.lifecycle ?? null,
      authStorage: infrastructure.authStorage ?? null,
      projectMarchDir: infrastructure.projectMarchDir ?? null,
    },
  };
}

function assertSessionBoundaryShape(input) {
  const allowed = new Set(["core", "capabilities", "infrastructure"]);
  const unexpected = Object.keys(input).filter((key) => !allowed.has(key));
  if (unexpected.length > 0) {
    throw new Error(`Runner session boundary only accepts core/capabilities/infrastructure; unexpected: ${unexpected.join(", ")}`);
  }
}
