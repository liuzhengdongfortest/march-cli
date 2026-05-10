export function parseShellCommand(input) {
  if (input === "/shell") return { type: "list" };
  if (input === "/shell spawn") return { type: "spawn", name: "" };
  if (input.startsWith("/shell spawn ")) {
    const name = input.slice("/shell spawn ".length).trim();
    return name ? { type: "spawn", name } : { type: "spawn", name: "" };
  }
  if (input.startsWith("/shell ")) {
    const idOrName = input.slice("/shell ".length).trim();
    return idOrName ? { type: "show", idOrName } : { type: "list" };
  }
  return { type: "none" };
}

export function handleShellCommand(command, { shellRuntime = null } = {}) {
  if (!shellRuntime) {
    return ["Shell runtime is disabled. Restart without --no-shell-runtime to use /shell."];
  }
  if (command.type === "spawn") {
    const shell = shellRuntime.spawnShell({ name: command.name || undefined });
    return [
      `Spawned shell: ${shell.id}  ${shell.name}  ${shell.status}`,
      "Open the drawer with Alt+S, then type directly to send input.",
    ];
  }
  if (command.type === "list") {
    const shells = shellRuntime.listShells();
    if (!shells.length) return ["No shells."];
    return [
      "Shells:",
      ...shells.map(formatShellListItem),
      "Use /shell <id-or-name> to inspect recent output, or /shell spawn [name] to start one.",
    ];
  }
  if (command.type === "show") {
    const shell = findShell(shellRuntime.listShells(), command.idOrName);
    if (!shell) return [`Error: shell not found: ${command.idOrName}`];
    const snapshot = shellRuntime.snapshotShell(shell.id);
    return [
      formatShellListItem(shell),
      "Recent output:",
      snapshot.screen?.plain || snapshot.plain || "(no output)",
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
