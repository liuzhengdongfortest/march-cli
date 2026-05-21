import { normalize } from "node:path";

export function createGatewayRunnerBridge({ runner, cwd }) {
  if (!runner) throw new Error("Gateway runner bridge requires a runner");
  const root = normalize(cwd);
  let activeGatewaySessionKey = null;

  return {
    async getRunner(session) {
      if (normalize(session.workspaceRoot) !== root) {
        throw new Error(`Gateway workspace '${session.workspaceAlias}' is not served by this process: ${session.workspaceRoot}`);
      }
      await activateGatewaySession({ runner, session, activeGatewaySessionKey });
      activeGatewaySessionKey = session.key;
      return wrapRunnerForGatewaySession(runner, session, () => { activeGatewaySessionKey = session.key; });
    },
  };
}

async function activateGatewaySession({ runner, session, activeGatewaySessionKey }) {
  const stats = runner.getSessionStats?.() ?? {};
  if (!session.piSessionFile) {
    if (!activeGatewaySessionKey) {
      bindSessionFile(session, stats);
      return;
    }
    const result = await runner.startNewSession();
    bindSessionFile(session, result ?? runner.getSessionStats?.() ?? {});
    return;
  }
  if (stats.sessionFile !== session.piSessionFile) {
    await runner.switchPiSession(session.piSessionFile);
  }
}

function wrapRunnerForGatewaySession(runner, session, markActive) {
  return new Proxy(runner, {
    get(target, property, receiver) {
      if (property === "startNewSession") {
        return async (...args) => {
          const result = await target.startNewSession(...args);
          bindSessionFile(session, result ?? target.getSessionStats?.() ?? {});
          markActive();
          return result;
        };
      }
      return Reflect.get(target, property, receiver);
    },
  });
}

function bindSessionFile(session, stats) {
  if (stats?.sessionFile) session.piSessionFile = stats.sessionFile;
  if (stats?.sessionId) session.piSessionId = stats.sessionId;
}
