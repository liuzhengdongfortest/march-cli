import { strict as assert } from "node:assert";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

export async function runOpenCloseFileToolsSmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: open/close file tools ---");
  const { createMarchCustomTools } = await import("../src/agent/tools.mjs");
  const dir = setupTmp();
  const a = join(dir, "a.txt");
  const b = join(dir, "b.txt");
  const missing = join(dir, "missing.txt");
  writeFileSync(a, "secret content\nline two", "utf8");
  writeFileSync(b, "second file", "utf8");

  const touched = [];
  const engine = createEngine(dir, { pinned: [b] });
  const tools = Object.fromEntries(createMarchCustomTools({
    cwd: dir,
    engine,
    ui: { editDiff: () => {} },
    lspService: { touchFile: (path) => touched.push(path) },
  }).map((tool) => [tool.name, tool]));

  const single = await tools.open_file.execute("tc-open", { path: a });
  assert.ok(single.content[0].text.includes(`Opened ${a}`));
  assert.ok(single.content[0].text.includes("2 lines"));
  assert.ok(!single.content[0].text.includes("secret content"));
  assert.equal(engine.isOpen(a), true);

  const batch = await tools.open_file.execute("tc-open-batch", { paths: [a, b, missing] });
  assert.ok(batch.content[0].text.includes("already_open"));
  assert.ok(batch.content[0].text.includes("opened"));
  assert.ok(batch.content[0].text.includes("error"));
  assert.ok(batch.content[0].text.includes(missing));
  assert.ok(!batch.content[0].text.includes("second file"));
  assert.equal(engine.isOpen(b), true);
  assert.deepEqual(touched, [a, b]);

  const closePinned = await tools.close_file.execute("tc-close-pinned", { path: b });
  assert.ok(closePinned.content[0].text.includes("pinned"));
  assert.equal(engine.isOpen(b), true);

  const closeBatch = await tools.close_file.execute("tc-close-batch", { paths: [a, b, missing] });
  assert.ok(closeBatch.content[0].text.includes("closed"));
  assert.ok(closeBatch.content[0].text.includes("pinned"));
  assert.ok(closeBatch.content[0].text.includes("not_open"));
  assert.equal(engine.isOpen(a), false);
  assert.equal(engine.isOpen(b), true);

  cleanup(dir);
  console.log("  PASS");
}

function createEngine(cwd, { pinned = [] } = {}) {
  const openFiles = new Map();
  const pins = new Set(pinned.map((path) => resolve(cwd, path)));
  return {
    resolvePath: (path) => resolve(cwd, path),
    isOpen: (path) => openFiles.has(path),
    getOpenFile: (path) => openFiles.get(path),
    openFile: (path) => {
      mkdirSync(cwd, { recursive: true });
      if (!existsSync(path)) throw new Error(`file not found: ${path}`);
      const content = readFileSync(path, "utf8");
      const entry = { content, lineCount: content.split("\n").length, pinned: pins.has(path) };
      openFiles.set(path, entry);
      return entry;
    },
    closeFile: (path) => {
      const entry = openFiles.get(path);
      if (entry?.pinned) return false;
      return openFiles.delete(path);
    },
  };
}
