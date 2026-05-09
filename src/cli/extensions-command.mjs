export function listExtensionPathsCommand(extensionPaths = []) {
  if (extensionPaths.length === 0) {
    return ["(no configured extension paths)"];
  }

  return [
    "Configured extension paths:",
    ...extensionPaths.map((extensionPath, index) => `${index + 1}. ${extensionPath}`),
    "(paths are passed to the pi runtime host; this list does not guarantee successful extension startup)",
  ];
}
