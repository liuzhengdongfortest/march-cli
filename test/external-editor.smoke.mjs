import { strict as assert } from "node:assert";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export async function runExternalEditorSmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: external editor ---");
  const { getExternalEditorCommand, openTextInExternalEditor } = await import("../src/cli/input/external-editor.mjs");
  const dir = setupTmp();

  assert.equal(getExternalEditorCommand({}), "");
  assert.equal(getExternalEditorCommand({ EDITOR: "ed" }), "ed");
  assert.equal(getExternalEditorCommand({ VISUAL: "vim", EDITOR: "ed" }), "vim");

  const missing = openTextInExternalEditor({ editorCommand: "" });
  assert.equal(missing.ok, false);
  assert.ok(missing.error.includes("No editor configured"));

  const result = openTextInExternalEditor({
    text: "before",
    editorCommand: "fake-editor",
    tempDir: dir,
    now: () => 123,
    spawn: (_bin, args) => {
      const file = args.at(-1);
      assert.equal(readFileSync(file, "utf8"), "before");
      writeFileSync(file, "after\n", "utf8");
      return { status: 0 };
    },
  });
  assert.deepEqual(result, { ok: true, text: "after" });
  assert.equal(existsSync(join(dir, "march-editor-123.md")), false);

  const failed = openTextInExternalEditor({
    text: "before",
    editorCommand: "fake-editor",
    tempDir: dir,
    now: () => 456,
    spawn: () => ({ status: 7 }),
  });
  assert.equal(failed.ok, false);
  assert.ok(failed.error.includes("7"));
  assert.equal(existsSync(join(dir, "march-editor-456.md")), false);

  cleanup(dir);
  console.log("  PASS");
}
