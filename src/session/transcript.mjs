import { readFileSync } from "node:fs";
import { buildTurnRecord, getTurnAssistantContent, getTurnUserContent } from "./turn-record.mjs";

export const DEFAULT_TRANSCRIPT_TURN_LIMIT = 20;

export function loadPiSessionTranscriptTurns(sessionPath, { limit = DEFAULT_TRANSCRIPT_TURN_LIMIT } = {}) {
  const entries = readPiSessionEntries(sessionPath);
  const turns = [];
  let current = null;

  for (const entry of entries) {
    if (entry?.type !== "message") continue;
    const message = entry.message;
    if (message?.role === "user") {
      current = { userContent: extractMessageText(message), assistantContent: "" };
      turns.push(current);
      continue;
    }
    if (message?.role === "assistant") {
      const text = extractMessageText(message);
      if (!current) {
        current = { userContent: "", assistantContent: text };
        turns.push(current);
      } else if (current.assistantContent) {
        current.assistantContent += `\n\n${text}`;
      } else {
        current.assistantContent = text;
      }
    }
  }

  const normalized = turns
    .filter((turn) => turn.userContent || turn.assistantContent)
    .map((turn, index) => buildTurnRecord({ index: index + 1, userContent: turn.userContent, assistantContent: turn.assistantContent }));
  return normalized.slice(-Math.max(0, limit));
}

export function writeTranscriptToOutput(output, turns) {
  if (!Array.isArray(turns) || turns.length === 0) return;
  for (const turn of turns) {
    const userContent = getTurnUserContent(turn);
    const assistantContent = getTurnAssistantContent(turn);
    if (userContent) {
      output.writeln("You");
      for (const line of String(userContent).split(/\r?\n/)) output.writeln(line);
    }
    if (assistantContent) {
      output.writeln("");
      output.writeln("March");
      output.writeMarkdown(String(assistantContent));
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
