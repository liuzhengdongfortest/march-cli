import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export function loadDotEnv(cwd, { homeDir = homedir(), sourceDir = dirname(dirname(fileURLToPath(import.meta.url))) } = {}) {
  for (const dir of [cwd, join(homeDir, ".march"), sourceDir]) {
    const path = join(dir, ".env");
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf-8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  }
}
