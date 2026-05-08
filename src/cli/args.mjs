import { parseArgs } from "node:util";

export function parseCliArgs(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      model: { type: "string", short: "m" },
      resume: { type: "string" },
      json: { type: "boolean" },
      pin: { type: "string", multiple: true },
      skill: { type: "string", multiple: true },
      "dump-context": { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: true,
  });

  return {
    model: values.model ?? "deepseek-v4-pro",
    resume: values.resume,
    json: values.json ?? false,
    pins: values.pin ?? [],
    skills: values.skill ?? [],
    dumpContext: values["dump-context"] ?? false,
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
  -m, --model <id>   Model ID (default: deepseek-v4-pro)
  --resume <id>      Resume a previous session
  --json             JSON output mode (no TUI)
  --dump-context     Write context snapshot to .march/context-snapshot.txt before each turn
  --pin <path>       Pin a file in context (repeatable)
  --skill <name>     Activate a skill (repeatable)
  -h, --help         Show this help
`);
}
