import { fileURLToPath } from "node:url";

export class LspDiagnosticStore {
  constructor() {
    this.byPath = new Map();
  }

  replaceFile({ serverId, uri, diagnostics = [] }) {
    const path = uriToPath(uri);
    if (!path) return;
    const normalized = diagnostics.map((diagnostic) => ({
      ...diagnostic,
      serverId,
      path,
    }));
    this.byPath.set(path, {
      path,
      updatedAt: Date.now(),
      diagnostics: normalized,
    });
  }

  snapshot() {
    const diagnostics = [];
    for (const entry of this.byPath.values()) {
      diagnostics.push(...entry.diagnostics);
    }
    return diagnostics;
  }
}

function uriToPath(uri) {
  if (typeof uri !== "string" || !uri.startsWith("file://")) return null;
  try {
    return fileURLToPath(uri);
  } catch {
    return null;
  }
}
