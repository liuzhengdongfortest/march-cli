import { saveSession } from "../session/persist.mjs";

export function parseSessionNameCommand(input) {
  if (input !== "/name" && !input.startsWith("/name ")) return { type: "none" };
  const name = input.slice("/name".length).trim();
  if (!name) return { type: "show" };
  if (name.length > 120) return { type: "error", message: "Session name must be 120 characters or less" };
  return { type: "set", name };
}

export function handleSessionNameCommand(command, { runner, sessionState, sessionSource = "pi" } = {}) {
  if (command.type === "error") return [`Error: ${command.message}`];
  if (command.type === "show") return [`Session name: ${runner.engine.sessionName || "(unnamed)"}`];

  const name = runner.setSessionName
    ? runner.setSessionName(command.name)
    : setEngineSessionName(runner.engine, command.name);
  if (sessionSource !== "pi" && sessionState?.sessionDir) {
    saveSession(sessionState.sessionDir, runner.engine);
  }
  return [`Session named: ${name}`];
}

function setEngineSessionName(engine, name) {
  if (typeof engine.setSessionName === "function") {
    engine.setSessionName(name);
  } else {
    engine.sessionName = String(name || "").trim();
  }
  return engine.sessionName;
}
