import { getTurnAssistantContent, getTurnUserContent } from "../../session/turn-record.mjs";

const MAX_SESSION_NAME_LENGTH = 60;

export function maybeAutoNameSession({ engine, session, setSessionName }) {
  if (engine?.sessionName || session?.sessionName) return null;
  if (!Array.isArray(engine?.turns) || engine.turns.length !== 1) return null;
  if (typeof setSessionName !== "function") return null;

  const title = generateSessionName(engine.turns[0]);
  if (!title) return null;
  return setSessionName(title);
}

export function generateSessionName(turn) {
  const text = normalizeTitleSource(getTurnUserContent(turn)) || normalizeTitleSource(getTurnAssistantContent(turn));
  if (!text) return "New session";
  return truncateTitle(stripPromptNoise(text), MAX_SESSION_NAME_LENGTH) || "New session";
}

function normalizeTitleSource(value) {
  return String(value ?? "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function stripPromptNoise(text) {
  return text
    .replace(/^[@#>\-\s]+/, "")
    .replace(/^(please|pls|can you|could you|help me|帮我|请)\s+/i, "")
    .replace(/[.。!?！？,:;，：；]+$/g, "")
    .trim();
}

function truncateTitle(text, maxLength) {
  if (text.length <= maxLength) return text;
  const sliced = text.slice(0, maxLength).trimEnd();
  const lastSpace = sliced.lastIndexOf(" ");
  if (lastSpace >= Math.floor(maxLength * 0.6)) return sliced.slice(0, lastSpace);
  return sliced;
}
