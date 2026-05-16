export function formatShellHints(shellRuntime, { limit = 5 } = {}) {
  const shells = (shellRuntime?.listShells?.() ?? []).filter((shell) => shell.status !== "killed").slice(0, limit);
  if (shells.length === 0) return "";
  const lines = ["[shell_hints]"];
  for (const shell of shells) {
    const args = shell.args?.length ? ` ${shell.args.join(" ")}` : "";
    const count = shell.scrollbackLineCount ?? shell.lineCount ?? 0;
    lines.push(`- ${shell.id} ${shell.name} ${shell.status} command: ${shell.command}${args} cwd: ${shell.cwd} lines: ${count}`);
  }
  lines.push("Use terminal_read or terminal_snapshot to inspect shell output.");
  return lines.join("\n");
}
