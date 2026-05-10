export function parseShellCommand(input) {
  if (input === "/shell") return { type: "list" };
  if (input.startsWith("/shell ")) {
    const idOrName = input.slice("/shell ".length).trim();
    return idOrName ? { type: "show", idOrName } : { type: "list" };
  }
  return { type: "none" };
}

export function handleShellCommand(command, { shellRuntime = null } = {}) {
  if (!shellRuntime) {
    return ["Shell runtime is not enabled."];
  }
  if (command.type === "list") {
    const shells = shellRuntime.listShells();
    if (!shells.length) return ["No shells."];
    return [
      "Shells:",
      ...shells.map(formatShellListItem),
      "Use /shell <id-or-name> to inspect recent output.",
    ];
  }
  if (command.type === "show") {
    const shell = findShell(shellRuntime.listShells(), command.idOrName);
    if (!shell) return [`Error: shell not found: ${command.idOrName}`];
    const snapshot = shellRuntime.snapshotShell(shell.id);
    return [
      formatShellListItem(shell),
      "Recent output:",
      snapshot.plain || "(no output)",
    ];
  }
  return [];
}

function findShell(shells, idOrName) {
  return shells.find((shell) => shell.id === idOrName || shell.name === idOrName) ?? null;
}

function formatShellListItem(shell) {
  const args = shell.args?.length ? ` ${shell.args.join(" ")}` : "";
  return `${shell.id}  ${shell.name}  ${shell.status}  ${shell.command}${args}  ${shell.lineCount ?? 0} lines`;
}
