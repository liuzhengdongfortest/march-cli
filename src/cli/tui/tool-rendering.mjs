import { extractToolOutput } from "../tool-output.mjs";
import { dim, red } from "./ui-theme.mjs";

export function writeToolStart({ output, name, args }) {
  const shortArgs = JSON.stringify(args).slice(0, 120);
  output.writeln(dim(`  ◆ ${name} ${shortArgs}`));
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
    output.writeln(red(`  ◆ ${name} failed`));
    if (errText) {
      for (const line of errText.split("\n").slice(0, 6)) {
        output.writeln(red(`    ${line.slice(0, 120)}`));
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
    output.writeln(dim(`    ${line.slice(0, 120)}`));
  }
  if (lines.length > limit) output.writeln(dim(`    … (${lines.length - limit} more lines)`));
  return true;
}
