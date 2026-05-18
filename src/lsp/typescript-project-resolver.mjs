import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const CONFIG_RE = /^(?:tsconfig(?:\..+)?|jsconfig)\.json$/;
const DEFAULT_EXCLUDES = ["node_modules", "bower_components", "jspm_packages"];
const MATCH_EXTENSIONS = [".ts", ".tsx", ".d.ts", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"];

export function resolveTypeScriptProjectRoot({ filePath, workspaceRoot }) {
  const configs = findTypeScriptConfigs(dirname(filePath), workspaceRoot);
  if (configs.length === 0) return null;

  const included = configs.find((config) => configIncludesFile(config, filePath));
  return dirname(included ?? configs[0]);
}

function findTypeScriptConfigs(start, stop) {
  const configs = [];
  let dir = resolve(start);
  const boundary = resolve(stop);
  for (;;) {
    configs.push(...configFilesIn(dir));
    if (dir === boundary || dirname(dir) === dir) return configs;
    dir = dirname(dir);
  }
}

function configFilesIn(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && CONFIG_RE.test(entry.name))
    .map((entry) => entry.name)
    .sort(configSort)
    .map((name) => join(dir, name));
}

function configSort(a, b) {
  return configRank(a) - configRank(b) || a.localeCompare(b);
}

function configRank(name) {
  if (name === "tsconfig.json") return 0;
  if (name === "jsconfig.json") return 1;
  return 2;
}

function configIncludesFile(configPath, filePath) {
  const config = readConfigChain(configPath);
  if (!config) return false;

  const exclude = config.exclude ?? DEFAULT_EXCLUDES.map((pattern) => ({ base: dirname(configPath), pattern }));
  if (exclude.some(({ base, pattern }) => matchesPatternFromBase(filePath, base, pattern))) return false;

  if (config.files) {
    return config.files.some(({ base, pattern }) => normalizePath(relative(base, filePath)) === normalizePath(pattern));
  }

  if (config.include) {
    return config.include.some(({ base, pattern }) => matchesPatternFromBase(filePath, base, pattern));
  }

  const file = normalizePath(relative(dirname(configPath), filePath));
  return !isOutside(file) && MATCH_EXTENSIONS.some((ext) => file.endsWith(ext));
}

function readConfigChain(path, seen = new Set()) {
  if (seen.has(path)) return null;
  seen.add(path);

  const raw = readConfig(path);
  if (!raw) return null;
  const base = resolveExtends(path, raw.extends, seen);
  return {
    files: patternList(raw.files, dirname(path)) ?? base?.files ?? null,
    include: patternList(raw.include, dirname(path)) ?? base?.include ?? null,
    exclude: patternList(raw.exclude, dirname(path)) ?? base?.exclude ?? null,
  };
}

function resolveExtends(configPath, value, seen) {
  if (typeof value !== "string" || !value.startsWith(".")) return null;
  const resolved = resolve(dirname(configPath), value.endsWith(".json") ? value : `${value}.json`);
  return existsSync(resolved) ? readConfigChain(resolved, seen) : null;
}

function readConfig(path) {
  try {
    return JSON.parse(stripJsonComments(readFileSync(path, "utf8")));
  } catch {
    return null;
  }
}

function patternList(value, base) {
  const items = arrayOfStrings(value);
  return items ? items.map((pattern) => ({ base, pattern })) : null;
}

function arrayOfStrings(value) {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : null;
}

function isOutside(path) {
  return path === ".." || path.startsWith("../") || path.includes(":");
}

function matchesPatternFromBase(filePath, base, pattern) {
  const file = normalizePath(relative(base, filePath));
  return !isOutside(file) && matchesConfigPattern(file, pattern);
}

function matchesConfigPattern(file, pattern) {
  const normalized = normalizePath(pattern);
  if (!normalized.includes("*") && file === normalized) return true;
  const glob = normalized.includes("*") ? normalized : `${trimSlash(normalized)}/**/*`;
  return globToRegExp(glob).test(file);
}

function globToRegExp(glob) {
  let source = "^";
  for (let i = 0; i < glob.length; i += 1) {
    const char = glob[i];
    if (char === "*") {
      if (glob[i + 1] === "*") {
        i += 1;
        if (glob[i + 1] === "/") {
          i += 1;
          source += "(?:.*/)?";
        } else {
          source += ".*";
        }
      } else {
        source += "[^/]*";
      }
    } else if (char === "?") {
      source += "[^/]";
    } else {
      source += escapeRegExp(char);
    }
  }
  return new RegExp(`${source}$`);
}

function trimSlash(path) {
  return path.replace(/\/+$/, "");
}

function normalizePath(path) {
  return path.replaceAll("\\", "/");
}

function escapeRegExp(value) {
  return value.replace(/[|\\{}()[\]^$+*?.]/g, "\\$&");
}

function stripJsonComments(source) {
  let out = "";
  let inString = false;
  let quote = "";
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    const next = source[i + 1];
    if (inString) {
      out += char;
      if (char === "\\") {
        out += next ?? "";
        i += 1;
      } else if (char === quote) {
        inString = false;
      }
    } else if (char === '"' || char === "'") {
      inString = true;
      quote = char;
      out += char;
    } else if (char === "/" && next === "/") {
      while (i < source.length && source[i] !== "\n") i += 1;
      out += "\n";
    } else if (char === "/" && next === "*") {
      i += 2;
      while (i < source.length && !(source[i] === "*" && source[i + 1] === "/")) i += 1;
      i += 1;
    } else {
      out += char;
    }
  }
  return out.replace(/,\s*([}\]])/g, "$1");
}
