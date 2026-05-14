import { spawnSync } from "node:child_process";

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
