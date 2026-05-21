#!/usr/bin/env node
import { homedir } from "node:os";
import { join } from "node:path";
import { createBrowserDaemonServer } from "./server.mjs";

const args = parseArgs(process.argv.slice(2));
const stateRoot = args["state-root"] ?? join(homedir(), ".march");
const server = createBrowserDaemonServer({ stateRoot });

process.on("SIGTERM", () => server.shutdown().then(() => process.exit(0)));
process.on("SIGINT", () => server.shutdown().then(() => process.exit(0)));

try {
  await server.start();
} catch (err) {
  process.stderr.write(`Browser daemon failed: ${err.message}\n`);
  process.exitCode = 1;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const key = argv[i].slice(2);
    out[key] = argv[i + 1]?.startsWith("--") ? true : argv[++i];
  }
  return out;
}
