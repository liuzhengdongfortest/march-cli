import { bold, dim, red, green, brightBlack } from "./ui-theme.mjs";

export function writeEditDiff({ output, path, diffLines }) {
  const lines = formatEditDiffLines({ path, diffLines });
  if (typeof output.addBlock === "function") output.addBlock({ type: "diff", lines });
  else for (const line of lines) output.writeln(line);
}

export function formatEditDiffLines({ path, diffLines }) {
  const counts = countChanges(diffLines);
  const summary = [`± ${path}`];
  if (counts.del > 0) summary.push(red(`${counts.del}-`));
  if (counts.add > 0) summary.push(green(`${counts.add}+`));

  const lines = [bold(summary.join("  "))];
  const gutterWidth = maxLineNumber(diffLines);
  for (const line of diffLines) {
    const num = line.lineNum != null ? String(line.lineNum).padStart(gutterWidth) : " ".repeat(gutterWidth);
    if (line.type === "del") lines.push(`${brightBlack(`${num} │`)} ${red(`- ${line.text}`)}`);
    else if (line.type === "add") lines.push(`${brightBlack(`${num} │`)} ${green(`+ ${line.text}`)}`);
    else lines.push(`${brightBlack(`${num} │`)} ${dim(`  ${line.text}`)}`);
  }
  return lines;
}

function countChanges(lines) {
  let del = 0; let add = 0;
  for (const line of lines) {
    if (line.type === "del") del += 1;
    if (line.type === "add") add += 1;
  }
  return { del, add };
}

function maxLineNumber(lines) {
  let max = 0;
  for (const line of lines) {
    if (line.lineNum != null && line.lineNum > max) max = line.lineNum;
  }
  return max > 0 ? String(max).length : 1;
}
