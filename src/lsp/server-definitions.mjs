const NODE_ROOT_MARKERS = ["package-lock.json", "bun.lockb", "bun.lock", "pnpm-lock.yaml", "yarn.lock", "package.json"];

export function createLspServerDefinitions({ resolveTypeScriptProjectRoot, resolveTypeScriptSdk, resolveTypeScriptServer }) {
  return [
    {
      id: "vue",
      extensions: [".vue"],
      rootMarkers: NODE_ROOT_MARKERS,
      command: ["vue-language-server"],
      managedCommand: "vue-language-server",
      args: ["--stdio"],
      initialization: ({ root, workspaceRoot }) => {
        const tsdk = resolveTypeScriptSdk({ root, workspaceRoot });
        return tsdk ? { typescript: { tsdk } } : null;
      },
      managedTypeScript: true,
      missingInitialization: "missing project typescript SDK",
    },
    {
      id: "typescript",
      extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"],
      rootMarkers: NODE_ROOT_MARKERS,
      projectRoot: resolveTypeScriptProjectRoot,
      command: ["typescript-language-server"],
      managedCommand: "typescript-language-server",
      args: ["--stdio"],
      initialization: ({ root, workspaceRoot }) => {
        const tsserver = resolveTypeScriptServer({ root, workspaceRoot });
        return tsserver ? { tsserver: { path: tsserver } } : null;
      },
      managedTypeScript: true,
      missingInitialization: "missing project typescript/tsserver.js",
    },
    {
      id: "python",
      extensions: [".py", ".pyi"],
      rootMarkers: ["pyproject.toml", "setup.py", "setup.cfg", "requirements.txt", "Pipfile", "pyrightconfig.json"],
      command: ["pyright-langserver"],
      managedCommand: "pyright-langserver",
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
        const tsdk = resolveTypeScriptSdk({ root, workspaceRoot });
        return tsdk ? { typescript: { tsdk } } : null;
      },
      missingInitialization: "missing project typescript SDK",
    },
    {
      id: "json",
      extensions: [".json", ".jsonc"],
      rootMarkers: NODE_ROOT_MARKERS,
      command: ["vscode-json-language-server"],
      managedCommand: "vscode-json-language-server",
      args: ["--stdio"],
    },
    {
      id: "html",
      extensions: [".html", ".htm"],
      rootMarkers: NODE_ROOT_MARKERS,
      command: ["vscode-html-language-server"],
      managedCommand: "vscode-html-language-server",
      args: ["--stdio"],
    },
    {
      id: "css",
      extensions: [".css", ".scss", ".sass", ".less"],
      rootMarkers: NODE_ROOT_MARKERS,
      command: ["vscode-css-language-server"],
      managedCommand: "vscode-css-language-server",
      args: ["--stdio"],
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
      id: "dockerfile",
      extensions: [".dockerfile"],
      filenames: ["dockerfile", "containerfile"],
      rootMarkers: ["Dockerfile", "docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"],
      command: ["docker-langserver"],
      managedCommand: "docker-langserver",
      args: ["--stdio"],
    },
    {
      id: "markdown",
      extensions: [".md", ".mdx", ".markdown"],
      rootMarkers: NODE_ROOT_MARKERS,
      command: ["marksman"],
      args: ["server"],
    },
    {
      id: "toml",
      extensions: [".toml"],
      rootMarkers: ["Cargo.toml", "pyproject.toml", "taplo.toml", ".taplo.toml"],
      command: ["taplo"],
      args: ["lsp", "stdio"],
    },
    {
      id: "terraform",
      extensions: [".tf", ".tfvars"],
      rootMarkers: [".terraform", ".terraform.lock.hcl", "terraform.tfstate"],
      command: ["terraform-ls"],
      args: ["serve"],
    },
    {
      id: "prisma",
      extensions: [".prisma"],
      rootMarkers: ["schema.prisma", "prisma/schema.prisma", "prisma"],
      command: ["prisma"],
      args: ["language-server"],
    },
  ];
}
