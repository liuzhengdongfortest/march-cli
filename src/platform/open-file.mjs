import { spawn } from "node:child_process";

export function openFileWithDefaultApp(filePath) {
  return new Promise((resolve, reject) => {
    const { command, args } = openCommand(filePath);
    const child = spawn(command, args, { detached: true, stdio: "ignore" });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

function openCommand(filePath) {
  if (process.platform === "win32") {
    return {
      command: "powershell.exe",
      args: ["-NoProfile", "-Command", "Start-Process -LiteralPath $args[0]", filePath],
    };
  }

  if (process.platform === "darwin") {
    return { command: "open", args: [filePath] };
  }

  return { command: "xdg-open", args: [filePath] };
}
