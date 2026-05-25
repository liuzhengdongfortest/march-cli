import { homedir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCliArgs, showHelp } from "./cli/args.mjs";
import { runInteractiveRepl, runSingleShotPrompt } from "./cli/repl-loop.mjs";
import { closeMarchRuntime } from "./cli/startup/runtime-close.mjs";
import { createCliAppRuntime } from "./cli/startup/app-runtime.mjs";
import { formatStartupBanner } from "./cli/startup/startup-banner.mjs";
import { loadDotEnv } from "./config/dotenv.mjs";
import { loadConfig } from "./config/loader.mjs";
import { registerSuperGrokOAuthProvider } from "./supergrok/oauth-provider.mjs";
import { installNetworkEnvironment } from "./network/environment.mjs";
import { runEarlyCliCommand } from "./cli/startup/early-command.mjs";
import { maybeRunGatewayDaemonCommand } from "./cli/startup/gateway-daemon-command.mjs";

export async function run(argv) {
  const cwd = process.cwd();
  loadDotEnv(cwd);
  registerSuperGrokOAuthProvider();

  const args = parseCliArgs(argv);
  if (args.help) {
    showHelp();
    return 0;
  }

  const config = loadConfig(cwd);
  const stateRoot = join(homedir(), ".march");
  installNetworkEnvironment(config.network);

  const earlyCommand = await runEarlyCliCommand(args, { config, cwd, stateRoot });
  if (earlyCommand.handled) return earlyCommand.code;

  const app = await createCliAppRuntime({ args, config, cwd, argv, stateRoot });
  if (!app.ok) return app.code;

  const gatewayDaemonCommand = await maybeRunGatewayDaemonCommand(args, {
    config,
    cwd,
    runner: app.runner,
    currentProject: app.currentProject,
    memoryStore: app.memoryStore,
    ui: app.ui,
    logger: app.logger,
  });
  if (gatewayDaemonCommand.handled) return gatewayDaemonCommand.code;

  if (args.prompt) {
    app.setTurnRunning(true);
    try {
      await runSingleShotPrompt({
        prompt: args.prompt,
        runner: app.runner,
        memoryStore: app.memoryStore,
        currentProject: app.currentProject,
        ui: app.ui,
        sessionState: app.sessionState,
        refreshStatusBar: app.refreshStatusBar,
        modeState: app.modeState,
      });
    } finally {
      app.setTurnRunning(false);
      await closeMarchRuntime({ runner: app.runner, memoryStore: app.memoryStore, ui: app.ui, logger: app.logger, blankLine: true });
    }
    app.logger.event("process.exit", { code: 0 });
    return 0;
  }

  const dumpContextPath = args.dumpContext ? relative(cwd, app.contextDumpRoot) : null;
  if (app.startupResume.transcriptTurns?.length > 0) app.ui.restoreTranscript?.(app.startupResume.transcriptTurns);
  for (const line of formatStartupBanner({ cwd, modelId: app.runner.engine.modelId, thinkingLevel: app.runner.engine.thinkingLevel, mode: app.modeState.get(), dumpContextPath })) app.ui.writeln(line);
  try {
    await runInteractiveRepl({
      cwd,
      args,
      ui: app.ui,
      runner: app.runner,
      memoryStore: app.memoryStore,
      currentProject: app.currentProject,
      currentProjectInfo: app.currentProjectInfo,
      workspaceSupervisor: app.workspaceSupervisor,
      stateRoot,
      sessionState: app.sessionState,
      sessionsRoot: app.sessionsRoot,
      projectMarchDir: app.projectMarchDir,
      sessionSource: app.sessionSource,
      extensionPaths: app.extensionPaths,
      keybindingConfig: app.keybindingConfig,
      promptTemplateConfig: app.promptTemplateConfig,
      renderStartupBanner: () => formatStartupBanner({ cwd, modelId: app.runner.engine.modelId, thinkingLevel: app.runner.engine.thinkingLevel, mode: app.modeState.get(), dumpContextPath }),
      refreshStatusBar: app.refreshStatusBar,
      setTurnRunning: app.setTurnRunning,
      modeState: app.modeState,
    });
  } finally {
    await closeMarchRuntime({ runner: app.runner, memoryStore: app.memoryStore, ui: app.ui, logger: app.logger });
  }
  app.logger.event("process.exit", { code: 0 });
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = await run(process.argv.slice(2));
