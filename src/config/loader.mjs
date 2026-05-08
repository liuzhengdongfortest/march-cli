import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export function loadConfig(cwd) {
  const config = {
    model: null,
    provider: "deepseek",
    skills: [],
    pins: [],
  };

  // 1. Global config: ~/.march/config.json
  const globalPath = join(homedir(), ".march", "config.json");
  if (existsSync(globalPath)) {
    try {
      const raw = readFileSync(globalPath, "utf8");
      Object.assign(config, JSON.parse(raw));
    } catch {}
  }

  // 2. Project config: <cwd>/.marchrc (overrides global)
  const projectRc = join(cwd, ".marchrc");
  if (existsSync(projectRc)) {
    try {
      const raw = readFileSync(projectRc, "utf8");
      Object.assign(config, JSON.parse(raw));
    } catch {}
  }

  // 3. Project dir config: <cwd>/.march/config.json (overrides .marchrc)
  const projectConfig = join(cwd, ".march", "config.json");
  if (existsSync(projectConfig)) {
    try {
      const raw = readFileSync(projectConfig, "utf8");
      Object.assign(config, JSON.parse(raw));
    } catch {}
  }

  return config;
}
