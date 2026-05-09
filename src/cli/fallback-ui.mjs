import { stdout } from "node:process";
import { extractToolOutput } from "./tool-output.mjs";

export function createJsonUI() {
  let thinkingBuf = "";
  return {
    readline: () => Promise.resolve(""),
    write: () => {},
    writeln: (text) => {
      stdout.write(text + "\n");
    },
    thinkingStart: () => { thinkingBuf = ""; },
    thinkingDelta: (delta) => { thinkingBuf += delta; },
    thinkingEnd: (tokens) => {
      stdout.write(JSON.stringify({ type: "thinking", tokens, content: thinkingBuf }) + "\n");
      thinkingBuf = "";
    },
    thinkingBlock: (tokens, content) => {
      stdout.write(JSON.stringify({ type: "thinking", tokens, content }) + "\n");
    },
    toggleLastThinking: () => {},
    toolStart: (name, args) => {
      stdout.write(JSON.stringify({ type: "tool_start", name, args }) + "\n");
    },
    toolEnd: (name, isError, result) => {
      stdout.write(JSON.stringify({ type: "tool_end", name, isError, output: extractToolOutput(result) }) + "\n");
    },
    textDelta: (delta) => {
      stdout.write(delta);
    },
    status: () => {},
    turnStart: () => {},
    turnEnd: () => {},
    summaryStart: () => {},
    summaryDone: () => {},
    retryStart: (event) => {
      stdout.write(JSON.stringify({ type: "retry_start", ...event }) + "\n");
    },
    retryEnd: (event) => {
      stdout.write(JSON.stringify({ type: "retry_end", ...event }) + "\n");
    },
    editDiff: (path, diffLines) => {
      stdout.write(JSON.stringify({ type: "edit_diff", path, diff: diffLines }) + "\n");
    },
    setEscapeHandler: () => {},
    setShiftTabHandler: () => {},
    setCtrlTHandler: () => {},
    setCtrlLHandler: () => {},
    openExternalEditor: () => {},
    toggleMouse: () => false,
    toggleToolOutput: () => false,
    close: () => {},
  };
}

export function createPlainUI() {
  let thinkingBuf = "";
  return {
    readline: (_prompt) => Promise.resolve(""),
    write: (text) => { stdout.write(text); },
    writeln: (text) => { stdout.write(text + "\n"); },
    thinkingStart: () => { thinkingBuf = ""; },
    thinkingDelta: (delta) => { thinkingBuf += delta; },
    thinkingEnd: (tokens) => {
      stdout.write(`\n\x1b[90m--- thinking (${tokens} tokens) ---\x1b[0m\n`);
      stdout.write(`\x1b[90m${thinkingBuf}\x1b[0m\n`);
      stdout.write(`\x1b[90m--- end thinking ---\x1b[0m\n\n`);
      thinkingBuf = "";
    },
    thinkingBlock: (tokens, content) => {
      stdout.write(`\n\x1b[90m--- thinking (${tokens} tokens) ---\x1b[0m\n`);
      stdout.write(`\x1b[90m${content}\x1b[0m\n`);
      stdout.write(`\x1b[90m--- end thinking ---\x1b[0m\n\n`);
    },
    toggleLastThinking: () => {},
    toolStart: (name, args) => {
      const shortArgs = JSON.stringify(args).slice(0, 120);
      stdout.write(`\n\x1b[2m  ◆ ${name} ${shortArgs}\x1b[0m\n`);
    },
    toolEnd: (name, isError, result) => {
      const out = extractToolOutput(result);
      if (isError) {
        stdout.write(`\x1b[31m  ◆ ${name} failed\x1b[0m\n`);
        if (out) stdout.write(`\x1b[31m    ${out.slice(0, 200)}\x1b[0m\n`);
      } else if (out) {
        stdout.write(`\x1b[2m    ${out.split("\n")[0].slice(0, 200)}\x1b[0m\n`);
      }
    },
    textDelta: (delta) => { stdout.write(delta); },
    status: (text) => { stdout.write(`\x1b[90m● ${text}\x1b[0m\n`); },
    turnStart: () => {},
    turnEnd: () => {},
    summaryStart: () => {},
    summaryDone: () => { stdout.write(`\n\x1b[90m● summary · done\x1b[0m\n`); },
    retryStart: ({ attempt, maxAttempts, delayMs, errorMessage }) => {
      stdout.write(`\x1b[33m● retrying (${attempt}/${maxAttempts}) in ${Math.ceil(delayMs / 1000)}s: ${errorMessage || "Unknown error"}\x1b[0m\n`);
    },
    retryEnd: ({ success, attempt, finalError }) => {
      const status = success ? "recovered" : "stopped";
      stdout.write(`\x1b[90m● retry ${status} after ${attempt} attempt${attempt === 1 ? "" : "s"}${finalError ? `: ${finalError}` : ""}\x1b[0m\n`);
    },
    editDiff: (path, diffLines) => {
      stdout.write(`\n\x1b[2m  ± ${path}\x1b[0m\n`);
      for (const d of diffLines) {
        if (d.type === "del") stdout.write(`\x1b[31m    - ${d.text}\x1b[0m\n`);
        else if (d.type === "add") stdout.write(`\x1b[32m    + ${d.text}\x1b[0m\n`);
        else stdout.write(`\x1b[2m      ${d.text}\x1b[0m\n`);
      }
    },
    setEscapeHandler: () => {},
    setShiftTabHandler: () => {},
    setCtrlTHandler: () => {},
    setCtrlLHandler: () => {},
    openExternalEditor: () => {},
    toggleMouse: () => false,
    toggleToolOutput: () => false,
    close: () => {},
  };
}
