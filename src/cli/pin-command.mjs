export function parsePinCommand(input) {
  if (input === "/pins") return { type: "list" };
  if (input.startsWith("/pin ")) return { type: "pin", path: input.slice(5).trim() };
  if (input.startsWith("/unpin ")) return { type: "unpin", path: input.slice(7).trim() };
  return { type: "none" };
}

export function handlePinCommand(command, { engine }) {
  if (command.type === "list") {
    const pins = engine.getPins();
    return [pins.length > 0 ? pins.join("\n") : "(no pinned files)"];
  }

  const absPath = engine.resolvePath(command.path);
  if (command.type === "pin") {
    engine.addPin(absPath);
    if (!engine.isOpen(absPath)) {
      try {
        engine.openFile(absPath);
      } catch {
        // Pin can refer to a path that does not exist yet.
      }
    }
    return [`Pinned: ${absPath}`];
  }

  if (command.type === "unpin") {
    engine.removePin(absPath);
    return [`Unpinned: ${absPath}`];
  }

  return [];
}
