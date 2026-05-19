import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { spawnCommand } from "../platform/spawn-command.mjs";
import { homedir } from "node:os";
import { join } from "node:path";

const DEFAULT_CACHE_ROOT = join(homedir(), ".march", "lsp", "node");

const MANAGED_PACKAGES = {
  "typescript-language-server": ["typescript-language-server", "typescript"],
  "vue-language-server": ["@vue/language-server", "typescript"],
  "pyright-langserver": ["pyright"],
  "vscode-json-language-server": ["vscode-langservers-extracted"],
  "vscode-html-language-server": ["vscode-langservers-extracted"],
  "vscode-css-language-server": ["vscode-langservers-extracted"],
  "docker-langserver": ["dockerfile-language-server-nodejs"],
};

const installs = new Map();

export function getManagedNodeLspRoot() {
  return process.env.MARCH_LSP_NODE_ROOT || DEFAULT_CACHE_ROOT;
}

export async function ensureManagedNodeCommand(name) {
  if (!MANAGED_PACKAGES[name]) return null;
  const root = getManagedNodeLspRoot();
  const existing = findManagedBin(name, root);
  if (existing) return { command: existing, root, installed: false };

  await ensureManagedPackages(name, root);
  const command = findManagedBin(name, root);
  if (!command) throw new Error(`managed install did not provide ${name}`);
  return { command, root, installed: true };
}

export async function ensureManagedTypeScript() {
  const root = getManagedNodeLspRoot();
  if (findManagedTypeScriptServer()) return { root, installed: false };
  await installPackages(root, ["typescript"]);
  if (!findManagedTypeScriptServer()) throw new Error("managed install did not provide typescript");
  return { root, installed: true };
}

export function findManagedTypeScriptServer() {
  const root = getManagedNodeLspRoot();
  const tsserver = join(root, "node_modules", "typescript", "lib", "tsserver.js");
  return existsSync(tsserver) ? tsserver : null;
}

export function findManagedTypeScriptSdk() {
  const root = getManagedNodeLspRoot();
  const lib = join(root, "node_modules", "typescript", "lib");
  return existsSync(join(lib, "tsserverlibrary.js")) || existsSync(join(lib, "tsserver.js")) ? lib : null;
}

async function ensureManagedPackages(name, root) {
  const key = `${root}:${name}`;
  if (!installs.has(key)) {
    installs.set(key, installPackages(root, MANAGED_PACKAGES[name]).finally(() => installs.delete(key)));
  }
  return await installs.get(key);
}

async function installPackages(root, packages) {
  mkdirSync(root, { recursive: true });
  const packageJson = join(root, "package.json");
  if (!existsSync(packageJson)) writeFileSync(packageJson, JSON.stringify({ private: true, name: "march-managed-lsp" }, null, 2));
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  await run(npm, ["install", "--no-audit", "--no-fund", "--save-exact", ...packages], { cwd: root });
}

function findManagedBin(name, root) {
  for (const bin of platformCommandNames(name)) {
    const candidate = join(root, "node_modules", ".bin", bin);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function platformCommandNames(name) {
  if (process.platform !== "win32") return [name];
  return [`${name}.cmd`, `${name}.exe`, name];
}

function run(command, args, { cwd }) {
  return new Promise((resolve, reject) => {
    const child = spawnCommand(command, args, { cwd, stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
      if (stderr.length > 4000) stderr = stderr.slice(-4000);
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} failed with exit ${code}${stderr ? `: ${stderr.trim()}` : ""}`));
    });
  });
}
