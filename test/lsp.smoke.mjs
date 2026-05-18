import { strict as assert } from "node:assert";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { formatLspSegment } from "../src/cli/commands/status-command.mjs";
import { resolveLspServerStatus } from "../src/lsp/servers.mjs";

export async function runLspSmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: lsp resolver and status ---");
  const dir = setupTmp();
  try {
    writeFileSync(join(dir, "package.json"), "{}\n");
    writeNodeBin(dir, "typescript-language-server");
    writeNodeBin(dir, "vue-language-server");
    writeTypeScriptSdk(dir);
    writeFileSync(join(dir, "src.ts"), "const n: number = 1;\n");
    writeFileSync(join(dir, "App.vue"), "<script setup lang=\"ts\"></script>\n");

    const ts = await resolveLspServerStatus({ filePath: join(dir, "src.ts"), workspaceRoot: dir });
    assert.equal(ts.status, "available");
    assert.equal(ts.server.id, "typescript");
    assert.ok(ts.server.command.includes("typescript-language-server"));
    assert.ok(ts.server.initialization.tsserver.path.endsWith("tsserver.js"));

    const vue = await resolveLspServerStatus({ filePath: join(dir, "App.vue"), workspaceRoot: dir });
    assert.equal(vue.status, "available");
    assert.equal(vue.server.id, "vue");
    const vueTsdk = vue.server.initialization.typescript.tsdk.replaceAll("\\", "/");
    assert.ok(vueTsdk.endsWith("typescript/lib"));

    const managedDir = setupTmp();
    const noLocalDir = setupTmp();
    const originalPath = process.env.PATH;
    try {
      process.env.MARCH_LSP_NODE_ROOT = managedDir;
      process.env.PATH = "";
      writeFileSync(join(noLocalDir, "package.json"), "{}\n");
      writeNodeBin(managedDir, "typescript-language-server");
      writeTypeScriptSdk(managedDir);
      const managedTs = await resolveLspServerStatus({ filePath: join(noLocalDir, "managed.ts"), workspaceRoot: noLocalDir });
      assert.equal(managedTs.status, "available");
      assert.equal(managedTs.server.managed, true);
      assert.ok(managedTs.server.command.includes("typescript-language-server"));
    } finally {
      if (originalPath === undefined) delete process.env.PATH;
      else process.env.PATH = originalPath;
      delete process.env.MARCH_LSP_NODE_ROOT;
      cleanup(managedDir);
      cleanup(noLocalDir);
    }

    assert.equal(formatLspSegment({ servers: [] }), "lsp:off");
    assert.equal(formatLspSegment({ servers: [{ id: "typescript", status: "idle" }] }), "lsp:ts✓");
    assert.equal(formatLspSegment({ servers: [{ id: "vue", status: "starting" }] }), "lsp:vue…");
    assert.equal(formatLspSegment({ servers: [{ id: "typescript", status: "unavailable" }] }), "lsp:ts?");
    assert.equal(formatLspSegment({ servers: [
      { id: "typescript", status: "idle" },
      { id: "vue", status: "starting" },
    ] }), "lsp:ts✓,vue…");
    assert.equal(formatLspSegment({ servers: [
      { id: "typescript", status: "idle" },
      { id: "vue", status: "failed" },
    ] }), "lsp:ts✓,vue!");
    console.log("  PASS");
  } finally {
    cleanup(dir);
  }
}

function writeNodeBin(root, name) {
  const binDir = join(root, "node_modules", ".bin");
  mkdirSync(binDir, { recursive: true });
  const file = process.platform === "win32" ? `${name}.cmd` : name;
  writeFileSync(join(binDir, file), "\n");
}

function writeTypeScriptSdk(root) {
  const typeScriptRoot = join(root, "node_modules", "typescript");
  const lib = join(typeScriptRoot, "lib");
  mkdirSync(lib, { recursive: true });
  writeFileSync(join(typeScriptRoot, "package.json"), JSON.stringify({ name: "typescript" }));
  writeFileSync(join(lib, "tsserver.js"), "\n");
  writeFileSync(join(lib, "tsserverlibrary.js"), "\n");
}
