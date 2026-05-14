import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";

const NODE_ROOT_MARKERS = ["package-lock.json", "bun.lockb", "bun.lock", "pnpm-lock.yaml", "yarn.lock", "package.json"];

const LSP_SERVERS = [
  {
    id: "vue",
    extensions: [".vue"],
    rootMarkers: NODE_ROOT_MARKERS,
    command: ["vue-language-server"],
    args: ["--stdio"],
    initialization: () => ({}),
  },
  {
    id: "typescript",
    extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"],
    rootMarkers: NODE_ROOT_MARKERS,
    command: ["typescript-language-server"],
    args: ["--stdio"],
    initialization: ({ root, workspaceRoot }) => {
      const tsserver = resolveModule("typescript/lib/tsserver.js", workspaceRoot) ?? resolveModule("typescript/lib/tsserver.js", root);
      if (!tsserver) return null;
      return { tsserver: { path: tsserver } };
    },
  },
  {
    id: "python",
    extensions: [".py", ".pyi"],
    rootMarkers: ["pyproject.toml", "setup.py", "setup.cfg", "requirements.txt", "Pipfile", "pyrightconfig.json"],
    command: ["pyright-langserver"],
    args: ["--stdio"],
  },
  {
    id: "go",
    extensions: [".go"],
    rootMarkers: ["go.work", "go.mod", "go.sum"],
    command: ["gopls"],
    args: [],
  },
  {
    id: "rust",
    extensions: [".rs"],
    rootMarkers: ["Cargo.toml", "Cargo.lock"],
    command: ["rust-analyzer"],
    args: [],
  },
  {
    id: "clangd",
    extensions: [".c", ".cpp", ".cc", ".cxx", ".c++", ".h", ".hpp", ".hh", ".hxx", ".h++"],
    rootMarkers: ["compile_commands.json", "compile_flags.txt", ".clangd"],
    command: ["clangd"],
    args: ["--background-index", "--clang-tidy"],
  },
  {
    id: "svelte",
    extensions: [".svelte"],
    rootMarkers: NODE_ROOT_MARKERS,
    command: ["svelteserver", "svelte-language-server"],
    args: ["--stdio"],
    initialization: () => ({}),
  },
  {
    id: "astro",
    extensions: [".astro"],
    rootMarkers: NODE_ROOT_MARKERS,
    command: ["astro-ls", "@astrojs/language-server"],
    args: ["--stdio"],
    initialization: ({ root, workspaceRoot }) => {
      const tsserver = resolveModule("typescript/lib/tsserver.js", workspaceRoot) ?? resolveModule("typescript/lib/tsserver.js", root);
      if (!tsserver) return null;
      return { typescript: { tsdk: dirname(tsserver) } };
    },
  },
  {
    id: "yaml",
    extensions: [".yaml", ".yml"],
    rootMarkers: NODE_ROOT_MARKERS,
    command: ["yaml-language-server"],
    args: ["--stdio"],
  },
  {
    id: "bash",
    extensions: [".sh", ".bash", ".zsh", ".ksh"],
    rootMarkers: [],
    command: ["bash-language-server"],
    args: ["start"],
  },
  {
    id: "lua",
    extensions: [".lua"],
    rootMarkers: [".luarc.json", ".luarc.jsonc", ".luacheckrc", ".stylua.toml", "stylua.toml", "selene.toml", "selene.yml"],
    command: ["lua-language-server"],
    args: [],
  },
  {
    id: "zig",
    extensions: [".zig", ".zon"],
    rootMarkers: ["build.zig"],
    command: ["zls"],
    args: [],
  },
  {
    id: "dart",
    extensions: [".dart"],
    rootMarkers: ["pubspec.yaml", "analysis_options.yaml"],
    command: ["dart"],
    args: ["language-server", "--lsp"],
  },
  {
    id: "php",
    extensions: [".php"],
    rootMarkers: ["composer.json", "composer.lock", ".php-version"],
    command: ["intelephense"],
    args: ["--stdio"],
    initialization: () => ({ telemetry: { enabled: false } }),
  },
  {
    id: "prisma",
    extensions: [".prisma"],
    rootMarkers: ["schema.prisma", "prisma/schema.prisma", "prisma"],
    command: ["prisma"],
    args: ["language-server"],
  },
];

export function resolveLspServer({ filePath, workspaceRoot }) {
  const ext = extensionOf(filePath);
  const def = LSP_SERVERS.find((server) => server.extensions.includes(ext));
  if (!def) return null;

  const root = def.rootMarkers.length > 0
    ? findNearestRoot(dirname(filePath), workspaceRoot, def.rootMarkers) ?? workspaceRoot
    : workspaceRoot;
  const command = findCommand(def.command, { root, workspaceRoot });
  if (!command) return null;
  const initialization = def.initialization?.({ root, workspaceRoot }) ?? {};
  if (initialization === null) return null;
  return {
    id: def.id,
    command,
    args: def.args,
    root,
    initialization,
  };
}

export function listLspServerDefinitions() {
  return LSP_SERVERS.map(({ id, extensions, rootMarkers, command, args }) => ({ id, extensions, rootMarkers, command, args }));
}

function findCommand(names, { root, workspaceRoot }) {
  for (const name of names) {
    const hit = findBin(name, { root, workspaceRoot });
    if (hit) return hit;
  }
  return null;
}

function findBin(name, { root, workspaceRoot }) {
  const names = platformCommandNames(name);
  for (const base of [root, workspaceRoot]) {
    for (const bin of names) {
      const candidate = join(base, "node_modules", ".bin", bin);
      if (existsSync(candidate)) return candidate;
    }
  }
  return findOnPath(names);
}

function platformCommandNames(name) {
  if (process.platform !== "win32") return [name];
  return name.includes("/") ? [name] : [`${name}.cmd`, `${name}.exe`, name];
}

function findOnPath(names) {
  const dirs = (process.env.PATH ?? "").split(process.platform === "win32" ? ";" : ":").filter(Boolean);
  for (const dir of dirs) {
    for (const name of names) {
      const candidate = join(dir, name);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

function resolveModule(id, base) {
  try {
    return createRequire(join(base, "package.json")).resolve(id);
  } catch {
    return null;
  }
}

function findNearestRoot(start, stop, markers) {
  let dir = resolve(start);
  const boundary = resolve(stop);
  for (;;) {
    for (const marker of markers) {
      if (existsSync(join(dir, marker))) return dir;
    }
    if (dir === boundary || dirname(dir) === dir) return null;
    dir = dirname(dir);
  }
}

function extensionOf(path) {
  const lower = path.toLowerCase();
  const dot = lower.lastIndexOf(".");
  return dot === -1 ? "" : lower.slice(dot);
}
