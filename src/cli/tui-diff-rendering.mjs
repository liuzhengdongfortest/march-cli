import { bold, dim, red, green, brightBlack } from "./ui-theme.mjs";

export function writeEditDiff({ output, path, diffLines }) {
  const counts = countChanges(diffLines);
  const summary = [`± ${path}`];
  if (counts.del > 0) summary.push(red(`${counts.del}-`));
  if (counts.add > 0) summary.push(green(`${counts.add}+`));
  output.writeln(bold(summary.join("  ")));

  const gutterWidth = maxLineNumber(diffLines);
  for (const line of diffLines) {
    const num = line.lineNum != null ? String(line.lineNum).padStart(gutterWidth) : " ".repeat(gutterWidth);
    if (line.type === "del") {
      output.writeln(`${brightBlack(`${num} │`)} ${red(`- ${line.text}`)}`);
    } else if (line.type === "add") {
      output.writeln(`${brightBlack(`${num} │`)} ${green(`+ ${line.text}`)}`);
    } else {
      output.writeln(`${brightBlack(`${num} │`)} ${dim(`  ${line.text}`)}`);
    }
  }
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
