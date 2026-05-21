import { strict as assert } from "node:assert";
import { join } from "node:path";

export async function runGatewayCoreSmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: gateway core ---");
  const cwd = setupTmp();
  try {
    const { normalizeGatewayConfig } = await import("../src/gateway/config.mjs");
    const { normalizeGatewayMessage, gatewaySessionKey } = await import("../src/gateway/message.mjs");
    const { GatewaySessionStore } = await import("../src/gateway/session-store.mjs");
    const { handleGatewaySlashCommand } = await import("../src/gateway/command-router.mjs");
    const { createGatewayMessageHandler } = await import("../src/gateway/handler.mjs");

    const gatewayConfig = normalizeGatewayConfig({
      gateway: {
        defaultWorkspace: "main",
        workspaces: {
          main: ".",
          other: "../other-project",
        },
      },
    }, { cwd });
    const message = normalizeGatewayMessage({ platform: "telegram", chat_id: 1001, user_id: 42, text: "  hello  " });
    assert.equal(message.text, "hello");
    assert.equal(gatewaySessionKey(message), "telegram:chat:1001");

    const store = new GatewaySessionStore({ gatewayConfig });
    const session = store.getOrCreate(message);
    assert.equal(session.modeState.get(), "discuss");
    assert.equal(session.workspaceAlias, "main");
    assert.equal(session.workspaceRoot, cwd);
    assert.equal(store.getOrCreate(message), session);

    const workspaceResult = await handleGatewaySlashCommand("/workspace set other", {
      runner: {},
      session,
      sessionStore: store,
    });
    assert.equal(workspaceResult.handled, true);
    assert.equal(session.workspaceAlias, "other");
    assert.equal(session.workspaceRoot, join(cwd, "..", "other-project"));
    assert.match(workspaceResult.lines[0], /^Workspace: other /);

    const modeResult = await handleGatewaySlashCommand("/do", {
      runner: {},
      session,
      sessionStore: store,
    });
    assert.equal(modeResult.handled, true);
    assert.equal(session.modeState.get(), "do");
    assert.deepEqual(modeResult.lines, ["Mode: Do"]);

    const calls = [];
    const handler = createGatewayMessageHandler({
      sessionStore: store,
      currentProject: "project",
      getRunner: async () => ({
        async runTurn(prompt, userMessage, options) {
          calls.push({ prompt, userMessage, options });
          return { draft: "ok" };
        },
      }),
    });
    const turnResult = await handler({ platform: "telegram", chatId: "1001", userId: "42", text: "build a plan" });
    assert.equal(turnResult.type, "turn");
    assert.deepEqual(turnResult.lines, ["ok"]);
    assert.equal(calls[0].userMessage, "build a plan");
    assert.equal(calls[0].options.currentProject, "project");
    assert.match(calls[0].prompt, /<mode>\nYou are in do mode/);
  } finally {
    cleanup(cwd);
  }
  console.log("  PASS");
}
