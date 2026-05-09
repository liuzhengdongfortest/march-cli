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
      "dump-context": { type: "boolean" },
      "pi-sessions": { type: "boolean" },
      "pi-runtime-host": { type: "boolean" },
      "pi-session-defaults": { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: true,
  });

  return {
    model: values.model ?? "deepseek-v4-pro",
    provider: values.provider,
    resume: values.resume,
    json: values.json ?? false,
    pins: values.pin ?? [],
    skills: values.skill ?? [],
    dumpContext: values["dump-context"] ?? false,
    piSessions: values["pi-sessions"] ?? false,
    piRuntimeHost: values["pi-runtime-host"] ?? false,
    piSessionDefaults: values["pi-session-defaults"] ?? false,
    help: values.help ?? false,
    prompt: positionals.join(" "),
  };
}

export function showHelp() {
  process.stdout.write(`march — terminal-native coding agent

Usage:
  march [options] [prompt]
  march [options]            (starts REPL)

Options:
  -m, --model <id>     Model ID (default: deepseek-v4-pro)
  --provider <name>    AI provider: deepseek, openai, anthropic (default: deepseek)
  --resume <id>        Resume a previous session
  --json               JSON output mode (no TUI)
  --dump-context       Write context snapshot to .march/context-snapshot.txt each turn
  --pi-sessions        Opt in to pi JSONL SessionManager persistence
  --pi-runtime-host    Opt in to pi AgentSessionRuntime host path
  --pi-session-defaults Preview pi-backed default session commands
  --pin <path>         Pin a file in context (repeatable)
  --skill <name>       Activate a skill (repeatable)
  -h, --help           Show this help
`);
}
