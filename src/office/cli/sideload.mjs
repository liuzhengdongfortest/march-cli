import { spawnCommand } from "../../platform/spawn-command.mjs";

export async function sideloadOfficeAddin(manifestPath, { app = "powerpoint" } = {}) {
  await runCommand(npxCommand(), [
    "--yes",
    "office-addin-dev-settings",
    "sideload",
    manifestPath,
    "desktop",
    "--app",
    app,
  ]);
}

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawnCommand(command, args, { stdio: "inherit", windowsHide: false });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) return resolve();
      reject(new Error(`${command} exited ${signal ?? code}`));
    });
  });
}

function npxCommand() {
  return process.platform === "win32" ? "npx.cmd" : "npx";
}
