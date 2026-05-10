import { parseArgs } from "node:util";

export function parseCliArgs(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      model: { type: "string", short: "m" },
      provider: { type: "string" },
      resume: { type: "string" },
      json: { type: "boolean" },
      pin: { type: "string", multiple: true },
      skill: { type: "string", multiple: true },
      extension: { type: "string", short: "e", multiple: true },
      "dump-context": { type: "boolean" },
      "pi-sessions": { type: "boolean" },
      "pi-runtime-host": { type: "boolean" },
      "pi-session-defaults": { type: "boolean" },
      "legacy-sessions": { type: "boolean" },
      "shell-runtime": { type: "boolean" },
      "no-shell-runtime": { type: "boolean" },
      "permission-mode": { type: "string" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: true,
  });

  const commandName = positionals[0] === "login" ? positionals[0] : null;

  return {
    command: commandName ? { name: commandName, args: positionals.slice(1) } : null,
    model: values.model ?? "deepseek-v4-pro",
    provider: values.provider,
    resume: values.resume,
    json: values.json ?? false,
    pins: values.pin ?? [],
    skills: values.skill ?? [],
    extensions: values.extension ?? [],
    dumpContext: values["dump-context"] ?? false,
    piSessions: values["pi-sessions"] ?? false,
    piRuntimeHost: values["pi-runtime-host"] ?? false,
    piSessionDefaults: values["pi-session-defaults"] ?? false,
    legacySessions: values["legacy-sessions"] ?? false,
    shellRuntime: values["no-shell-runtime"] ? false : true,
    permissionMode: values["permission-mode"] ?? "default",
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

Options:
  -m, --model <id>     Model ID (default: deepseek-v4-pro)
  --provider <name>    AI provider: deepseek, openai, anthropic (default: deepseek)
  --resume <id>        Resume a pi session by default
  --json               JSON output mode (no TUI)
  --dump-context       Write context snapshot to .march/context-snapshot.txt each turn
  --legacy-sessions    Use old .march/sessions startup and command semantics
  --pi-sessions        Force pi JSONL SessionManager persistence
  --pi-runtime-host    Force pi AgentSessionRuntime host path
  --pi-session-defaults Compatibility alias for the default pi session mode
  --shell-runtime      Enable interactive PTY shell tools (default)
  --no-shell-runtime   Disable interactive PTY shell tools and shell pane
  --permission-mode <mode>  Permission mode: default, bypassPermissions, dontAsk (default: default)
  --pin <path>         Pin a file in context (repeatable)
  --skill <name>       Activate a skill (repeatable)
  -e, --extension <path>
                       Load a pi extension path in the default runtime host (repeatable)
  -h, --help           Show this help
`);
}
