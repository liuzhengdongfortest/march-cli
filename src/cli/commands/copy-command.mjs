import { spawn, spawnSync } from "node:child_process";

export function copyLastAssistantMessage({ engine, writeClipboard = writeSystemClipboard } = {}) {
  const message = findLastAssistantMessage(engine);
  if (!message) return ["Error: no assistant response to copy"];
  const result = writeClipboard(message);
  if (result?.ok === false) return [`Error: ${result.message}`];
  return [`Copied last assistant response (${message.length} chars)`];
}

export function findLastAssistantMessage(engine) {
  const turns = engine?.turns ?? [];
  for (let i = turns.length - 1; i >= 0; i -= 1) {
    const text = turns[i]?.assistantMessage;
    if (typeof text === "string" && text.trim()) return text;
  }
  return "";
}

export function writeSystemClipboard(text, { platform = process.platform } = {}) {
  const command = clipboardCommand(platform);
  if (!command) return { ok: false, message: `clipboard is not supported on ${platform}` };
  const result = spawnSync(command.bin, command.args, {
    input: text,
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.error) return { ok: false, message: result.error.message };
  if (result.status !== 0) {
    const stderr = (result.stderr || "").trim();
    return { ok: false, message: stderr || `${command.bin} exited ${result.status}` };
  }
  return { ok: true };
}

export function writeSystemClipboardAsync(text, { platform = process.platform } = {}) {
  const command = clipboardCommand(platform);
  if (!command) return Promise.resolve({ ok: false, message: `clipboard is not supported on ${platform}` });
  return new Promise((resolve) => {
    let settled = false;
    let stderr = "";
    const done = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const child = spawn(command.bin, command.args, {
      windowsHide: true,
      stdio: ["pipe", "ignore", "pipe"],
    });
    child.stderr?.setEncoding?.("utf8");
    child.stderr?.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (err) => done({ ok: false, message: err.message }));
    child.on("close", (status) => {
      if (status === 0) done({ ok: true });
      else done({ ok: false, message: stderr.trim() || `${command.bin} exited ${status}` });
    });
    child.stdin?.on("error", (err) => done({ ok: false, message: err.message }));
    child.stdin?.end(text, "utf8");
  });
}

function clipboardCommand(platform) {
  if (platform === "win32") {
    return {
      bin: "powershell.exe",
      args: ["-NoProfile", "-Command", "Set-Clipboard -Value ([Console]::In.ReadToEnd())"],
    };
  }
  if (platform === "darwin") return { bin: "pbcopy", args: [] };
  return { bin: "sh", args: ["-lc", "command -v wl-copy >/dev/null && wl-copy || xclip -selection clipboard || xsel --clipboard --input"] };
}
