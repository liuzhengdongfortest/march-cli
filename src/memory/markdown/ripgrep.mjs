import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export function resolveBundledRipgrepPath({ platform = process.platform, arch = process.env.npm_config_arch || process.arch, requireResolve = require.resolve } = {}) {
  const binaryName = platform === "win32" ? "rg.exe" : "rg";
  try {
    return requireResolve(`@vscode/ripgrep-${platform}-${arch}/bin/${binaryName}`);
  } catch {
    return null;
  }
}

export function resolveRipgrepCommand(options = {}) {
  return resolveBundledRipgrepPath(options) ?? "rg";
}
