import { strict as assert } from "node:assert";
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export async function runContextEngineSmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: context engine ---");
  const { ContextEngine } = await import("../src/context/engine.mjs");
  const dir = setupTmp();

  const engine = new ContextEngine({
    cwd: dir,
    modelId: "test",
    provider: "deepseek",
    skills: [],
    pins: [],
  });

  const ctx = engine.buildContext("装備を確認する");
  assert.ok(ctx.includes("[system_core version="));
  assert.ok(ctx.includes('model_prompt="default"'));
  assert.ok(ctx.includes("[session_identity]"));
  assert.ok(ctx.includes("[workspace_status]"));
  assert.ok(ctx.includes("[diagnostics]"));
  assert.ok(ctx.includes("[runtime_status]"));
  assert.ok(ctx.includes("[recent_chat]"));
  assert.ok(ctx.includes("(no prior turns)"));
  assert.ok(ctx.includes("Use write(path, content)"));
  assert.ok(!ctx.includes("[injections]"));
  assert.ok(!ctx.includes("model: test"));
  assert.ok(!ctx.includes("thinking: medium"));
  assert.ok(!ctx.includes("write_file"));
  assert.ok(!ctx.includes("[memory]"));
  assert.ok(!ctx.includes("[session_status]"));

  const modelPromptEngine = new ContextEngine({
    cwd: dir,
    modelId: "deepseek-v4-pro",
    provider: "other-provider",
    skills: [],
    pins: [],
  });
  assert.ok(modelPromptEngine.buildContext("").includes('model_prompt="deepseek-v4-pro"'));

  const injectionEngine = new ContextEngine({
    cwd: dir,
    modelId: "test",
    provider: "deepseek",
    injections: [
      { type: "mcp_server", source: "filesystem", content: "Use this server only for workspace file operations." },
    ],
  });
  const injectionCtx = injectionEngine.buildContext("");
  assert.ok(injectionCtx.includes("[injections]"));
  assert.ok(injectionCtx.includes("## MCP server: filesystem"));
  assert.ok(injectionCtx.includes("Use this server only for workspace file operations."));
  assert.ok(injectionCtx.indexOf("[system_core") < injectionCtx.indexOf("[injections]"));
  assert.ok(injectionCtx.indexOf("[injections]") < injectionCtx.indexOf("[session_identity]"));

  const shellEngine = new ContextEngine({
    cwd: dir,
    modelId: "test",
    provider: "deepseek",
    shellRuntime: {
      listShells: () => [{ id: "sh1", name: "dev", status: "running", command: "powershell.exe", args: ["-NoLogo"], cwd: dir, lineCount: 1 }],
      snapshotShell: () => ({ plain: "ready", ansi: "\x1b[32mready\x1b[0m" }),
    },
  });
  const shellCtx = shellEngine.buildContext("check shell");
  assert.ok(shellCtx.includes("[runtime_status]"));
  assert.ok(shellCtx.includes("[shells]"));
  assert.ok(shellCtx.includes("recent_output:\nready"));
  assert.ok(!shellCtx.includes("\x1b[32m"));
  assert.ok(shellCtx.indexOf("[runtime_status]") < shellCtx.indexOf("[shells]"));
  assert.ok(shellCtx.indexOf("[shells]") < shellCtx.indexOf("[recent_chat]"));

  engine.setRuntimeState({ modelId: "other-model", provider: "test-provider", thinkingLevel: "high" });
  const runtimeCtx = engine.buildContext("");
  assert.ok(!runtimeCtx.includes("provider: test-provider"));
  assert.ok(!runtimeCtx.includes("model: other-model"));
  assert.ok(!runtimeCtx.includes("thinking: high"));

  engine.recordTurn({
    userMessage: "hello",
    summary: "tested the engine",
    userRecallHints: [{ id: "mem_user", name: "User hint", description: "User recall hint" }],
    assistantRecallHints: [{ id: "mem_assistant", name: "Assistant hint", description: "Assistant recall hint" }],
  });
  assert.equal(engine.turns.length, 1);
  assert.equal(engine.turns[0].index, 1);

  const ctx2 = engine.buildContext("装備を確認する");
  assert.ok(ctx2.includes("tested the engine"));
  assert.ok(ctx2.includes('[passive_recall source="user"]'));
  assert.ok(ctx2.includes("mem_user | User hint | User recall hint"));
  assert.ok(ctx2.includes('[passive_recall source="assistant"]'));

  for (let i = 0; i < 10; i++) {
    engine.recordTurn({ userMessage: `extra ${i}`, summary: `summary ${i}` });
  }
  assert.equal(engine.turns.length, 10);
  assert.equal(engine.turns[0].userMessage, "extra 0");
  assert.equal(engine.turns.at(-1).userMessage, "extra 9");

  const testFile = join(dir, "test.txt");
  writeFileSync(testFile, "line1\nline2\nline3");
  engine.addPin(testFile);
  const { lineCount, pinned } = engine.openFile(testFile);
  assert.equal(lineCount, 3);
  assert.equal(pinned, true);
  assert.equal(engine.getPins().length, 1);

  const ctx3 = engine.buildContext("装備を確認する");
  assert.ok(ctx3.includes("[open_files]"));
  assert.ok(ctx3.includes("1 | line1"));
  assert.ok(ctx3.includes("2 | line2"));
  assert.ok(ctx3.includes("(pinned)"));
  assert.ok(ctx3.indexOf("[open_files]") < ctx3.indexOf("[workspace_status]"));
  assert.ok(ctx3.indexOf("[open_files]") < ctx3.indexOf("[diagnostics]"));
  assert.ok(ctx3.indexOf("[diagnostics]") < ctx3.indexOf("[workspace_status]"));

  const diagnosticEngine = new ContextEngine({
    cwd: dir,
    modelId: "test",
    provider: "deepseek",
    lspService: {
      snapshot: () => ({
        status: "idle",
        diagnostics: [{
          serverId: "vue",
          source: "vue",
          severity: 1,
          path: testFile,
          range: { start: { line: 1, character: 4 }, end: { line: 1, character: 8 } },
          code: "TS2322",
          message: "Type 'string' is not assignable to type 'number'.",
        }],
      }),
    },
  });
  diagnosticEngine.openFile(testFile);
  const diagnosticCtx = diagnosticEngine.buildContext("");
  assert.ok(diagnosticCtx.includes("source: lsp"));
  assert.ok(diagnosticCtx.includes("status: idle"));
  assert.ok(diagnosticCtx.includes(`- error vue ${testFile}:2:5 TS2322`));
  assert.ok(diagnosticCtx.includes("Type 'string' is not assignable to type 'number'."));

  writeFileSync(testFile, "new1\nnew2");
  const refreshedCtx = engine.buildContext("装備を確認する");
  assert.ok(refreshedCtx.includes(`--- ${testFile} (1-2) (pinned) ---`));
  assert.ok(refreshedCtx.includes("1 | new1"));
  assert.ok(refreshedCtx.includes("2 | new2"));
  assert.ok(!refreshedCtx.includes("stale"));

  rmSync(testFile);
  const staleCtx = engine.buildContext("装備を確認する");
  assert.ok(staleCtx.includes(`--- ${testFile} (1-2) (pinned, stale) ---`));
  assert.ok(staleCtx.includes("This file may have been moved or deleted"));
  assert.ok(staleCtx.includes("If you no longer need this file, close it."));
  assert.ok(staleCtx.includes("1 | new1"));
  assert.ok(staleCtx.includes("2 | new2"));

  const testFile2 = join(dir, "test2.txt");
  writeFileSync(testFile2, "data");
  engine.openFile(testFile2);
  assert.equal(engine.openFiles.size, 2);
  engine.closeFile(testFile2);
  assert.equal(engine.openFiles.size, 1);
  assert.equal(engine.closeFile(testFile), false);

  engine.setToolDefs([
    { name: "test_tool", description: "A test tool", parameters: { x: "number" } },
  ]);
  const ctx4 = engine.buildContext("装備を確認する");
  assert.ok(ctx4.includes("[tools]"));
  assert.ok(ctx4.includes("test_tool"));
  const toolsLayerIndex = ctx4.indexOf("\n\n[tools]\n");
  assert.notEqual(toolsLayerIndex, -1);
  assert.ok(toolsLayerIndex < ctx4.indexOf("\n\n[session_identity]\n"));
  assert.ok(toolsLayerIndex < ctx4.indexOf("\n\n[open_files]\n"));

  injectionEngine.setToolDefs([
    { name: "mcp__filesystem__read", description: "Read through MCP", parameters: { path: "Path" } },
  ]);
  const injectionToolsCtx = injectionEngine.buildContext("");
  const injectionLayerIndex = injectionToolsCtx.indexOf("\n\n[injections]\n");
  const injectionToolsLayerIndex = injectionToolsCtx.indexOf("\n\n[tools]\n");
  assert.notEqual(injectionLayerIndex, -1);
  assert.notEqual(injectionToolsLayerIndex, -1);
  assert.ok(injectionLayerIndex < injectionToolsLayerIndex);
  assert.ok(injectionToolsLayerIndex < injectionToolsCtx.indexOf("\n\n[session_identity]\n"));

  cleanup(dir);
  console.log("  PASS");
}
