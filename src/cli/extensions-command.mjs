export function listExtensionPathsCommand(extensionPaths = [], diagnostics = []) {
  const lines = [];

  if (extensionPaths.length === 0) {
    lines.push("(no configured extension paths)");
  } else {
    lines.push(
      "Configured extension paths:",
      ...extensionPaths.map((extensionPath, index) => `${index + 1}. ${extensionPath}`),
      "(paths are passed to the pi runtime host; this list does not guarantee successful extension startup)",
    );
  }

  if (diagnostics.length === 0) {
    lines.push("(no extension diagnostics)");
    return lines;
  }

  lines.push("Extension diagnostics:");
  for (const diagnostic of diagnostics) {
    lines.push(`- ${diagnostic.type ?? "info"}: ${diagnostic.message ?? String(diagnostic)}`);
  }
  return lines;
}
