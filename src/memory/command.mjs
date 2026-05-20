import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { createRemoteMemoryServer, createMemoryServerToken } from "./remote/server.mjs";
import { defaultRemoteMemoryName, normalizeSourceName, parseRemoteMemoryUrl } from "./remote/config.mjs";
import { upsertRemoteMemorySource, removeRemoteMemorySource, readConfigJson, globalConfigJsonPath } from "../config/config-json.mjs";
import { RemoteMemoryClient } from "./remote/client.mjs";

export async function runMemoryCommand(args, { homeDir = homedir(), stdout = process.stdout, stderr = process.stderr } = {}) {
  const subcommand = args.command?.args?.[0] ?? "list";
  const rest = args.command?.args?.slice(1) ?? [];
  try {
    if (subcommand === "serve") return await runServeCommand(args, rest, { homeDir, stdout });
    if (subcommand === "add") return await runAddCommand(args, rest, { homeDir, stdout });
    if (subcommand === "list") return runListCommand({ homeDir, stdout });
    if (subcommand === "remove") return runRemoveCommand(rest, { homeDir, stdout });
    stderr.write(memoryUsage());
    return 1;
  } catch (err) {
    stderr.write(`Error: ${err.message}\n`);
    return 1;
  }
}

async function runServeCommand(args, rest, { homeDir, stdout }) {
  const folder = resolve(rest[0] ?? args.memoryRoot ?? join(homeDir, ".march", "March Memories"));
  if (!existsSync(folder)) throw new Error(`folder does not exist: ${folder}`);
  const name = normalizeSourceName(args.name) || normalizeSourceName(basename(folder)) || "remote-memory";
  const host = args.host ?? "127.0.0.1";
  const port = Number(args.port ?? 4317);
  const token = args.token || createMemoryServerToken();

  if (!args.foreground) {
    const childArgs = [process.argv[1], "memory", "serve", folder, "--foreground", "--host", host, "--port", String(port), "--name", name, "--token", token];
    const child = spawn(process.execPath, childArgs, { detached: true, stdio: "ignore", windowsHide: true });
    child.unref();
    const url = `http://${host}:${port}`;
    writeServerState({ homeDir, pid: child.pid, folder, name, url, token });
    stdout.write(formatServeStarted({ name, url, token, pid: child.pid }));
    return 0;
  }

  const remote = createRemoteMemoryServer({ root: folder, name, token });
  await new Promise((resolveListen, reject) => {
    remote.server.once("error", reject);
    remote.server.listen(port, host, resolveListen);
  });
  const address = remote.server.address();
  const actualHost = host === "0.0.0.0" ? host : address.address;
  const url = `http://${actualHost}:${address.port}`;
  writeServerState({ homeDir, pid: process.pid, folder, name, url, token });
  stdout.write(formatServeStarted({ name, url, token, pid: process.pid }));
  await new Promise(() => {});
  return 0;
}

async function runAddCommand(args, rest, { homeDir, stdout }) {
  const rawUrl = rest[0];
  if (!rawUrl) throw new Error("Usage: march memory add <url> [--name <name>]");
  const parsed = parseRemoteMemoryUrl(rawUrl, { token: args.token });
  if (!parsed.url) throw new Error(`invalid remote memory URL: ${rawUrl}`);
  let name = normalizeSourceName(args.name);
  if (!name) {
    name = await resolveRemoteName(parsed) || defaultRemoteMemoryName(parsed.url);
  }
  upsertRemoteMemorySource({ path: globalConfigJsonPath(homeDir), name, url: parsed.url, token: parsed.token });
  stdout.write(`Added remote memory: ${name}\nurl: ${parsed.url}\n`);
  return 0;
}

function runListCommand({ homeDir, stdout }) {
  const config = readConfigJson(globalConfigJsonPath(homeDir));
  const sources = Array.isArray(config.remoteMemories) ? config.remoteMemories : [];
  if (sources.length === 0) {
    stdout.write("No remote memories configured.\n");
    return 0;
  }
  stdout.write(sources.map((source) => `${source.name}\t${source.url}`).join("\n") + "\n");
  return 0;
}

function runRemoveCommand(rest, { homeDir, stdout }) {
  const name = normalizeSourceName(rest[0]);
  if (!name) throw new Error("Usage: march memory remove <name>");
  const removed = removeRemoteMemorySource({ path: globalConfigJsonPath(homeDir), name });
  stdout.write(removed ? `Removed remote memory: ${name}\n` : `Remote memory not found: ${name}\n`);
  return removed ? 0 : 1;
}

async function resolveRemoteName({ url, token }) {
  try {
    const metadata = await new RemoteMemoryClient({ name: "remote", url, token }).metadata();
    return normalizeSourceName(metadata.name);
  } catch {
    return null;
  }
}

function writeServerState({ homeDir, ...state }) {
  const dir = join(homeDir, ".march");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "memory-server.json"), `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function formatServeStarted({ name, url, token, pid }) {
  const addUrl = `${url}?token=${encodeURIComponent(token)}`;
  return [
    "Remote memory server started",
    `name: ${name}`,
    `url:  ${url}`,
    `pid:  ${pid}`,
    `add:  march memory add ${addUrl} --name ${name}`,
    "",
  ].join("\n");
}

function memoryUsage() {
  return `Usage:\n  march memory serve [folder] [--host <host>] [--port <port>] [--name <name>]\n  march memory add <url> [--name <name>]\n  march memory list\n  march memory remove <name>\n`;
}
