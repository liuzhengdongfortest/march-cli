import { parseArgs } from "node:util";

export function parseCliArgs(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      model: { type: "string", short: "m" },
      provider: { type: "string" },
      resume: { type: "string" },
      json: { type: "boolean" },
      extension: { type: "string", short: "e", multiple: true },
      extension: { type: "string", short: "e", multiple: true },
      config: { type: "boolean" },
      "include-key": { type: "boolean" },
      "profile-only": { type: "boolean" },
      "dump-context": { type: "boolean" },
      "pi-sessions": { type: "boolean" },
      "pi-runtime-host": { type: "boolean" },
      "shell-runtime": { type: "boolean" },
      "no-shell-runtime": { type: "boolean" },
      "permission-mode": { type: "string" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: true,
  });

  const commandName = ["login", "provider", "websearch"].includes(positionals[0]) ? positionals[0] : null;

  return {
    command: commandName ? { name: commandName, args: positionals.slice(1) } : null,
    model: values.model ?? null,
    provider: values.provider,
    resume: values.resume,
    json: values.json ?? false,
    extensions: values.extension ?? [],
    dumpContext: values["dump-context"] ?? false,
    providerConfig: values.config ?? false,
    includeKey: values["include-key"] ?? false,
    profileOnly: values["profile-only"] ?? false,
    piSessions: values["pi-sessions"] ?? false,
    piRuntimeHost: values["pi-runtime-host"] ?? false,
    shellRuntime: values["no-shell-runtime"] ? false : true,
    permissionMode: values["permission-mode"] ?? "bypassPermissions",
    help: values.help ?? false,
    prompt: commandName ? "" : positionals.join(" "),
  };
}

export function showHelp() {
  process.stdout.write(`march — terminal-native coding agent

Usage:
  march [options] [prompt]
  march [options]            (starts REPL)
  march login [provider]     Login to an OAuth provider
  march provider --config    Configure provider credentials
  march provider share [id]  Share a provider profile
  march provider accept <token>
  march websearch --config  Configure web search credentials

Options:
  -m, --model <id>     Initial model ID override
  --provider <name>    Initial provider override
  --resume <id>        Resume a pi session by default
  --json               JSON output mode (no TUI)
  --config             With provider/websearch command, open configuration
  --include-key        With provider share, include API key
  --profile-only       With provider share, omit API key
  --dump-context       Write every prompt sent to the model under .march/context-dumps/
  --pi-sessions        Force pi JSONL SessionManager persistence
  --pi-runtime-host    Force pi AgentSessionRuntime host path
  --shell-runtime      Enable interactive PTY shell tools (default)
  --no-shell-runtime   Disable interactive PTY shell tools and shell pane
  --permission-mode <mode>  Permission mode: default, bypassPermissions, dontAsk (default: bypassPermissions)
  -e, --extension <path>
                       Load a pi extension path in the default runtime host (repeatable)
  -h, --help           Show this help
`);
}
