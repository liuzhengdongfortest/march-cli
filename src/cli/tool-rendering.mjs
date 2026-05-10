import { extractToolOutput } from "./tool-output.mjs";

export function writeToolStart({ output, name, args }) {
  const shortArgs = JSON.stringify(args).slice(0, 120);
  output.writeln(`\x1b[2m  ◆ ${name} ${shortArgs}\x1b[0m`);
}

export function writeToolEnd({
  output,
  name,
  isError,
  result,
  toolsExpanded = false,
  extractToolOutputImpl = extractToolOutput,
}) {
  if (isError) {
    const errText = extractToolOutputImpl(result);
    output.writeln(`\x1b[31m  ◆ ${name} failed\x1b[0m`);
    if (errText) {
      for (const line of errText.split("\n").slice(0, 6)) {
        output.writeln(`\x1b[31m    ${line.slice(0, 120)}\x1b[0m`);
      }
    }
    return true;
  }

  const out = extractToolOutputImpl(result);
  if (!out) return false;
  const lines = out.split("\n");
  const limit = toolsExpanded ? 40 : 4;
  const show = lines.slice(0, limit);
  for (const line of show) {
    output.writeln(`\x1b[2m    ${line.slice(0, 120)}\x1b[0m`);
  }
  if (lines.length > limit) output.writeln(`\x1b[2m    … (${lines.length - limit} more lines)\x1b[0m`);
  return true;
}
