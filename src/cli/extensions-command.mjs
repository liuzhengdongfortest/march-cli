export function listExtensionPathsCommand(extensionPaths = [], diagnostics = [], lifecycleState = null) {
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

  if (lifecycleState) {
    lines.push(
      "March lifecycle hooks:",
      `- status: ${lifecycleState.status}`,
      `- registered hooks: ${lifecycleState.registeredHookCount}`,
      `- policy: ${lifecycleState.policy?.mode ?? "unknown"}; blocking by default: ${lifecycleState.policy?.defaultBlocking ? "yes" : "no"}`,
    );
    const deniedEffects = lifecycleState.policy?.deniedEffects ?? [];
    if (deniedEffects.length > 0) {
      lines.push(`- denied effects: ${deniedEffects.join(", ")}`);
    }
    const lifecycleDiagnostics = uniqueLifecycleDiagnostics(lifecycleState.diagnostics ?? [], diagnostics);
    if (lifecycleDiagnostics.length > 0) {
      lines.push("March lifecycle diagnostics:");
      for (const diagnostic of lifecycleDiagnostics) {
        lines.push(`- ${diagnostic.type ?? "info"}: ${diagnostic.message ?? String(diagnostic)}`);
      }
    }
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

function uniqueLifecycleDiagnostics(lifecycleDiagnostics, extensionDiagnostics) {
  const extensionKeys = new Set(extensionDiagnostics.map(formatDiagnosticKey));
  return lifecycleDiagnostics.filter((diagnostic) => !extensionKeys.has(formatDiagnosticKey(diagnostic)));
}

function formatDiagnosticKey(diagnostic) {
  return `${diagnostic?.type ?? "info"}:${diagnostic?.message ?? String(diagnostic)}`;
}
