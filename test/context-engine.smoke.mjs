import { strict as assert } from "node:assert";
import { writeFileSync } from "node:fs";

export async function runContextEngineSmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: context engine ---");
  const { ContextEngine } = await import("../src/context/engine.mjs");
  const dir = setupTmp();

  const engine = new ContextEngine({
    cwd: dir,
    modelId: "test",
    provider: "deepseek",
  });

  const ctx = engine.buildContext("装備を確認する");
  assert.ok(ctx.includes("[system_core]"));
  assert.ok(!ctx.includes("model_prompt="));
  assert.ok(!ctx.includes("version="));
  assert.ok(ctx.includes("[session_identity]"));
  assert.ok(ctx.includes("[workspace_status]"));
  assert.ok(!ctx.includes("[diagnostics]"));
  assert.ok(!ctx.includes("[shells]"));
  assert.ok(!ctx.includes("[runtime_status]"));
  assert.ok(ctx.includes("[recent_chat]"));
  assert.ok(ctx.includes("(no prior turns)"));
  assert.ok(ctx.includes("Use edit_file for all file writes."));
  assert.ok(!ctx.includes("[injections]"));
  assert.ok(!ctx.includes("model: test"));
  assert.ok(!ctx.includes("thinking: medium"));
  assert.ok(!ctx.includes("write_file"));
  assert.ok(!ctx.includes("[memory]"));
  assert.ok(!ctx.includes("[session_status]"));

  const providerCtx = engine.buildProviderContext("装備を確認する");
  assert.ok(providerCtx.system.includes("[system_core]"));
  assert.ok(!providerCtx.system.includes("[recent_chat]"));
  assert.ok(!providerCtx.system.includes("[workspace_status]"));
  assert.ok(providerCtx.userMessages.some((message) => message.name === "workspace_status" && message.content.includes("[workspace_status]")));
  assert.equal(providerCtx.userMessages.at(-1).name, "recent_chat");
  assert.ok(providerCtx.userMessages.at(-1).content.includes("[recent_chat]"));
  assert.ok(providerCtx.userMessages.at(-1).content.includes("[current_user]\n装備を確認する"));

  const modelPromptEngine = new ContextEngine({
    cwd: dir,
    modelId: "deepseek-v4-pro",
    provider: "other-provider",
  });
  assert.ok(modelPromptEngine.buildContext("").includes("Build context from current project facts before editing."));

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
  assert.ok(!shellCtx.includes("[shells]"));
  assert.ok(!shellCtx.includes("recent_output:\nready"));
  assert.ok(!shellCtx.includes("\x1b[32m"));
  assert.ok(shellCtx.indexOf("[workspace_status]") < shellCtx.indexOf("[recent_chat]"));

  engine.setRuntimeState({ modelId: "other-model", provider: "test-provider", thinkingLevel: "high" });
  const runtimeCtx = engine.buildContext("");
  assert.ok(!runtimeCtx.includes("provider: test-provider"));
  assert.ok(!runtimeCtx.includes("model: other-model"));
  assert.ok(!runtimeCtx.includes("thinking: high"));

  engine.recordTurn({
    userMessage: "hello",
    assistantMessage: "tested the engine",
    userRecallHints: [{ id: "mem_user", name: "User hint", description: "User recall hint" }],
    assistantRecallHints: [{ id: "mem_assistant", name: "Assistant hint", description: "Assistant recall hint" }],
  });
  assert.equal(engine.turns.length, 1);
  assert.equal(engine.turns[0].index, 1);
  assert.deepEqual([...engine.getRecentRecallMemoryIds()].sort(), ["mem_assistant", "mem_user"]);

  const ctx2 = engine.buildContext("装備を確認する");
  assert.ok(ctx2.includes("tested the engine"));
  assert.ok(!ctx2.includes("WorkSummary"));
  assert.ok(ctx2.includes('[passive_recall source="user"]'));
  assert.ok(ctx2.includes("mem_user | User hint | User recall hint"));
  assert.ok(ctx2.includes('[passive_recall source="assistant"]'));

  for (let i = 0; i < 10; i++) {
    engine.recordTurn({ userMessage: `extra ${i}`, assistantMessage: `answer ${i}` });
  }
  assert.equal(engine.turns.length, 11);
  assert.equal(engine.turns[0].userMessage, "hello");
  assert.equal(engine.turns.at(-1).userMessage, "extra 9");

  for (let i = 10; i < 15; i++) {
    engine.recordTurn({ userMessage: `extra ${i}`, assistantMessage: `answer ${i}` });
  }
  assert.equal(engine.turns.length, 10);
  assert.equal(engine.turns[0].userMessage, "extra 5");
  assert.equal(engine.turns.at(-1).userMessage, "extra 14");
  assert.deepEqual([...engine.getRecentRecallMemoryIds()], []);

  // diagnostics are available to runtime services, but not injected into context.
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
          path: join(dir, "vue-file.ts"),
          range: { start: { line: 1, character: 4 }, end: { line: 1, character: 8 } },
          code: "TS2322",
          message: "Type 'string' is not assignable to type 'number'.",
        }],
      }),
    },
  });
  const diagnosticCtx = diagnosticEngine.buildContext("");
  assert.ok(!diagnosticCtx.includes("source: lsp"));
  assert.ok(!diagnosticCtx.includes("status: idle"));
  assert.ok(!diagnosticCtx.includes("Type 'string' is not assignable"));

  engine.setToolDefs([
    { name: "test_tool", description: "A test tool", parameters: { x: "number" } },
  ]);
  const ctx4 = engine.buildContext("装備を確認する");
  assert.ok(!ctx4.includes("[tools]"));
  assert.ok(!ctx4.includes("test_tool"));

  injectionEngine.setToolDefs([
    { name: "mcp__filesystem__read", description: "Read through MCP", parameters: { path: "Path" } },
  ]);
  const injectionToolsCtx = injectionEngine.buildContext("");
  const injectionLayerIndex = injectionToolsCtx.indexOf("\n\n[injections]\n");
  assert.notEqual(injectionLayerIndex, -1);
  assert.ok(!injectionToolsCtx.includes("[tools]"));
  assert.ok(injectionLayerIndex < injectionToolsCtx.indexOf("\n\n[session_identity]\n"));

  cleanup(dir);
  console.log("  PASS");
}
