export function buildShellLayers({ shellRuntime, truncateText = truncate } = {}) {
  const shells = (shellRuntime?.listShells?.() ?? []).filter((s) => s.status !== "killed");
  if (!shells.length) return [];
  const blocks = shells.map((shell) => {
    const snapshot = shellRuntime.snapshotShell(shell.id);
    const output = snapshot.plain ? truncateText(snapshot.plain, 2000) : "(no output)";
    return [
      `## ${shell.name} (${shell.id})`,
      `status: ${shell.status}`,
      `command: ${shell.command}${shell.args?.length ? ` ${shell.args.join(" ")}` : ""}`,
      `cwd: ${shell.cwd}`,
      `lines: ${shell.lineCount}`,
      "recent_output:",
      output,
    ].join("\n");
  });
  return [`[shells]\n${blocks.join("\n\n")}`];
}

function truncate(text, maxLen) {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "\n...(truncated)";
}
