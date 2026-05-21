import { normalizeGatewayConfig } from "./config.mjs";
import { runGatewayDaemon } from "./daemon.mjs";
import { createDefaultGatewayPlatformRegistry } from "./platform-registry.mjs";
export async function runGatewayCommand(args, {
  config,
  cwd = process.cwd(),
  stdout = process.stdout,
  stderr = process.stderr,
  platformRegistry = createDefaultGatewayPlatformRegistry(),
  getRunner,
  currentProject = "",
} = {}) {
  const [subcommand = "status", ...rest] = args.command?.args ?? [];
  const gatewayConfig = normalizeGatewayConfig(config, { cwd });

  if (subcommand === "status") {
    writeLines(stdout, formatGatewayStatus(gatewayConfig, platformRegistry));
    return 0;
  }
  if (subcommand === "workspaces") {
    writeLines(stdout, formatGatewayWorkspaces(gatewayConfig));
    return 0;
  }
  if (subcommand === "platforms") {
    writeLines(stdout, formatGatewayPlatforms(gatewayConfig, platformRegistry));
    return 0;
  }
  if (subcommand === "run") {
    const platform = rest[0] ?? firstEnabledPlatform(gatewayConfig);
    if (!platform) {
      stderr.write("Error: no gateway platform configured.\n");
      return 1;
    }
    if (gatewayConfig.platforms[platform]?.enabled !== true) {
      stderr.write(`Error: gateway platform '${platform}' is not enabled in config.\n`);
      return 1;
    }
    if (!platformRegistry.has(platform)) {
      stderr.write(`Error: gateway platform '${platform}' is not implemented in this build.\n`);
      return 1;
    }
    if (typeof getRunner !== "function") {
      stderr.write("Error: gateway runner bridge is not wired for this command path yet.\n");
      return 1;
    }
    await runGatewayDaemon({ platform, platformRegistry, gatewayConfig, getRunner, currentProject });
    return 0;
  }


  stderr.write("Usage: march gateway [status|workspaces|platforms|run [platform]]\n");
  return 1;
}

function formatGatewayStatus(gatewayConfig, platformRegistry) {
  return [
    `Gateway: ${gatewayConfig.enabled ? "enabled" : "disabled"}`,
    `Default workspace: ${gatewayConfig.defaultWorkspace ?? "not configured"}`,
    `Configured workspaces: ${Object.keys(gatewayConfig.workspaces).length}`,
    `Configured platforms: ${Object.keys(gatewayConfig.platforms).length}`,
    `Implemented platforms: ${platformRegistry.list().join(", ") || "none"}`,
    ...formatDiagnostics(gatewayConfig.diagnostics),
  ];
}

function formatGatewayWorkspaces(gatewayConfig) {
  const workspaces = Object.values(gatewayConfig.workspaces);
  if (workspaces.length === 0) return ["No gateway workspaces configured."];
  return [
    "Gateway workspaces:",
    ...workspaces.map((workspace) => {
      const marker = workspace.alias === gatewayConfig.defaultWorkspace ? "*" : " ";
      return `${marker} ${workspace.alias}: ${workspace.root}`;
    }),
  ];
}

function formatGatewayPlatforms(gatewayConfig, platformRegistry) {
  const platformIds = Object.keys(gatewayConfig.platforms).sort();
  if (platformIds.length === 0) return ["No gateway platforms configured."];
  return [
    "Gateway platforms:",
    ...platformIds.map((id) => {
      const enabled = gatewayConfig.platforms[id]?.enabled === true ? "enabled" : "disabled";
      const implemented = platformRegistry.has(id) ? "implemented" : "not implemented";
      return `- ${id}: ${enabled}, ${implemented}`;
    }),
  ];
}

function firstEnabledPlatform(gatewayConfig) {
  return Object.entries(gatewayConfig.platforms).find(([, value]) => value?.enabled === true)?.[0] ?? null;
}

function formatDiagnostics(diagnostics = []) {
  return diagnostics.map((entry) => `${entry.type}: ${entry.message}`);
}

function writeLines(stream, lines) {
  for (const line of lines) stream.write(`${line}\n`);
}
