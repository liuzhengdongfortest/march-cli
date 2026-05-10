export function writeEditDiff({ output, path, diffLines }) {
  output.writeln(`\x1b[2m  ± ${path}\x1b[0m`);
  for (const line of diffLines) {
    if (line.type === "del") {
      output.writeln(`\x1b[31m    - ${line.text}\x1b[0m`);
    } else if (line.type === "add") {
      output.writeln(`\x1b[32m    + ${line.text}\x1b[0m`);
    } else {
      output.writeln(`\x1b[2m      ${line.text}\x1b[0m`);
    }
  }
}
