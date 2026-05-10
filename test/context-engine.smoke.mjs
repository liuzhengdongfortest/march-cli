import { strict as assert } from "node:assert";
import { writeFileSync } from "node:fs";
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
  assert.ok(ctx.includes("[system_core]"));
  assert.ok(ctx.includes("[injections]"));
  assert.ok(ctx.includes("[session_status]"));
  assert.ok(ctx.includes("[runtime_status]"));
  assert.ok(ctx.includes("[recent_chat]"));
  assert.ok(ctx.includes("(no prior turns)"));
  assert.ok(ctx.includes("Use write(path, content)"));
  assert.ok(ctx.includes("model: test"));
  assert.ok(ctx.includes("thinking: medium"));
  assert.ok(!ctx.includes("write_file"));
  assert.ok(!ctx.includes("[memory]"));

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
  assert.ok(runtimeCtx.includes("provider: test-provider"));
  assert.ok(runtimeCtx.includes("model: other-model"));
  assert.ok(runtimeCtx.includes("thinking: high"));

  engine.recordTurn({ userMessage: "hello", summary: "tested the engine" });
  assert.equal(engine.turns.length, 1);
  assert.equal(engine.turns[0].index, 1);

  const ctx2 = engine.buildContext("装備を確認する");
  assert.ok(ctx2.includes("tested the engine"));

  const testFile = join(dir, "test.txt");
  writeFileSync(testFile, "line1\nline2\nline3");
  engine.addPin(testFile);
  const { lineCount, pinned } = engine.openFile(testFile);
  assert.equal(lineCount, 3);
  assert.equal(pinned, true);
  assert.equal(engine.getPins().length, 1);

  const ctx3 = engine.buildContext("装備を確認する");
  assert.ok(ctx3.includes("[open_files]"));
  assert.ok(ctx3.includes("line1"));
  assert.ok(ctx3.includes("(pinned)"));

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

  cleanup(dir);
  console.log("  PASS");
}
