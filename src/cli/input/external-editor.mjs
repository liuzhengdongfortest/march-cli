import { spawnSync } from "node:child_process";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function openTextInExternalEditor({
  text = "",
  editorCommand = getExternalEditorCommand(),
  now = () => Date.now(),
  spawn = spawnSync,
  tempDir = tmpdir(),
} = {}) {
  if (!editorCommand) {
    return { ok: false, error: "No editor configured. Set $VISUAL or $EDITOR." };
  }

  const tmpFile = join(tempDir, `march-editor-${now()}.md`);
  try {
    writeFileSync(tmpFile, String(text ?? ""), "utf8");
    const [bin, ...args] = editorCommand.split(" ");
    const result = spawn(bin, [...args, tmpFile], {
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    if (result.status !== 0) {
      return { ok: false, error: `Editor exited with status ${result.status ?? "unknown"}` };
    }
    return {
      ok: true,
      text: readFileSync(tmpFile, "utf8").replace(/\n$/, ""),
    };
  } finally {
    try { unlinkSync(tmpFile); } catch {}
  }
}

export function getExternalEditorCommand(env = process.env) {
  return env.VISUAL || env.EDITOR || "";
}
