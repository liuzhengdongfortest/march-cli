import { runGatewayCommand } from "../../gateway/command.mjs";
import { createGatewayRunnerBridge } from "../../gateway/runner-bridge.mjs";
import { closeMarchRuntime } from "./runtime-close.mjs";

export async function maybeRunGatewayDaemonCommand(args, {
  config,
  cwd,
  runner,
  currentProject,
  memoryStore,
  ui,
  logger,
} = {}) {
  if (args.command?.name !== "gateway" || args.command.args?.[0] !== "run") return { handled: false, code: null };
  const bridge = createGatewayRunnerBridge({ runner, cwd });
  try {
    return { handled: true, code: await runGatewayCommand(args, { config, cwd, getRunner: bridge.getRunner, currentProject }) };
  } finally {
    await closeMarchRuntime({ runner, memoryStore, ui, logger });
  }
}
