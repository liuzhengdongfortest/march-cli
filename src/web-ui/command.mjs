import { existsSync } from "node:fs";
import { createWebUiServer } from "./server.mjs";
import { createWebRuntimeHost } from "./runtime-host.mjs";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 4174;

export async function runWebUiCommand(args, { config, cwd, stateRoot, useRuntimeProcess = true } = {}) {
  const host = args.host ?? DEFAULT_HOST;
  const port = Number.parseInt(args.port ?? "", 10) || DEFAULT_PORT;
  assertWebBuildReady();
  const runtime = await createWebRuntimeHost({ args, config, cwd, stateRoot, useRuntimeProcess });
  const server = createWebUiServer({ runtime });
  await listen(server, port, host);
  process.stdout.write(`March Web running at http://${host}:${port}\n`);
  await waitForShutdown({ server, runtime });
  return 0;
}

function assertWebBuildReady() {
  if (existsSync(new URL("./dist/index.html", import.meta.url))) return;
  throw new Error("Web UI build not found. Run: npm run web:build");
}

function listen(server, port, host) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });
}

function waitForShutdown({ server, runtime }) {
  return new Promise((resolve) => {
    const shutdown = async () => {
      process.off("SIGINT", shutdown);
      process.off("SIGTERM", shutdown);
      await new Promise((done) => server.close(done));
      await runtime.dispose?.();
      resolve();
    };
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
  });
}
