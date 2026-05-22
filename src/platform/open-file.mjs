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
    // cmd.exe start delegates to the user's shell association more reliably than
    // PowerShell Start-Process for media files on Windows.
    return { command: "cmd.exe", args: ["/c", "start", "", filePath] };
  }

  if (platform === "darwin") {
    return { command: "open", args: [filePath] };
  }

  return { command: "xdg-open", args: [filePath] };
}
