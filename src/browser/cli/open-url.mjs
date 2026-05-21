import { spawn } from "node:child_process";

export function openBrowserUrl(url) {
  return new Promise((resolve, reject) => {
    const { command, args } = openUrlCommand(url);
    const child = spawn(command, args, { detached: true, stdio: "ignore", windowsHide: true });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

function openUrlCommand(url) {
  if (process.platform === "win32") {
    return { command: "powershell.exe", args: ["-NoProfile", "-Command", "Start-Process $args[0]", url] };
  }
  if (process.platform === "darwin") return { command: "open", args: [url] };
  return { command: "xdg-open", args: [url] };
}
