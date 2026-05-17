import { readFileSync } from "node:fs";

export const DEFAULT_TRANSCRIPT_TURN_LIMIT = 20;

export function loadPiSessionTranscriptTurns(sessionPath, { limit = DEFAULT_TRANSCRIPT_TURN_LIMIT } = {}) {
  const entries = readPiSessionEntries(sessionPath);
  const turns = [];
  let current = null;

  for (const entry of entries) {
    if (entry?.type !== "message") continue;
    const message = entry.message;
    if (message?.role === "user") {
      current = { userMessage: extractMessageText(message), assistantMessage: "" };
      turns.push(current);
      continue;
    }
    if (message?.role === "assistant") {
      const text = extractMessageText(message);
      if (!current) {
        current = { userMessage: "", assistantMessage: text };
        turns.push(current);
      } else if (current.assistantMessage) {
        current.assistantMessage += `\n\n${text}`;
      } else {
        current.assistantMessage = text;
      }
    }
  }

  const normalized = turns
    .filter((turn) => turn.userMessage || turn.assistantMessage)
    .map((turn, index) => ({ index: index + 1, ...turn }));
  return normalized.slice(-Math.max(0, limit));
}

export function writeTranscriptToOutput(output, turns) {
  if (!Array.isArray(turns) || turns.length === 0) return;
  for (const turn of turns) {
    if (turn.userMessage) {
      output.writeln("You");
      for (const line of String(turn.userMessage).split(/\r?\n/)) output.writeln(line);
    }
    if (turn.assistantMessage) {
      output.writeln("");
      output.writeln("March");
      output.writeMarkdown(String(turn.assistantMessage));
      output.ensureNewline();
      output.sealCurrentText();
    }
    output.writeln("");
  }
}

function readPiSessionEntries(sessionPath) {
  const text = readFileSync(sessionPath, "utf8");
  const entries = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line));
    } catch {
      // Ignore partial or malformed JSONL entries; transcript restore is best effort.
    }
  }
  return entries;
}

function extractMessageText(message) {
  const content = message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part?.type === "text" || part?.type === "input_text") return part.text ?? "";
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}
