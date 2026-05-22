import { spawn } from "node:child_process";

export function openFileWithDefaultApp(filePath, { spawnFn = spawn } = {}) {
  return new Promise((resolve, reject) => {
    const { command, args, options } = openCommand(filePath);
    const child = spawnFn(command, args, { ...options, detached: true, stdio: "ignore" });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

export function openCommand(filePath, { platform = process.platform } = {}) {
  if (platform === "win32") {
    return { command: "cmd.exe", args: ["/c", "start", "", filePath] };
  }

  if (platform === "darwin") {
    return { command: "open", args: [filePath] };
  }

  return { command: "xdg-open", args: [filePath] };
}
