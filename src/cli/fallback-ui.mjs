import { stdout } from "node:process";
import { extractToolOutput } from "./tool-output.mjs";
import { brightBlack, dim, red, green, yellow } from "./tui/ui-theme.mjs";

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
    setStatusBar: () => {},
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
    requestPermission: async () => true,
    setEscapeHandler: () => {},
    setCtrlCHandler: () => {},
    setShiftTabHandler: () => {},
    setCtrlTHandler: () => {},
    setCtrlLHandler: () => {},
    setPasteImageHandler: () => {},
    getInputText: () => "",
    insertTextAtCursor: () => {},
    openExternalEditor: () => {},
    toggleMouse: () => false,
    toggleToolOutput: () => false,
    requestExit: () => {},
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
      stdout.write(`\n${brightBlack(`--- thinking (${tokens} tokens) ---`)}\n`);
      stdout.write(`${brightBlack(thinkingBuf)}\n`);
      stdout.write(`${brightBlack("--- end thinking ---")}\n\n`);
      thinkingBuf = "";
    },
    thinkingBlock: (tokens, content) => {
      stdout.write(`\n${brightBlack(`--- thinking (${tokens} tokens) ---`)}\n`);
      stdout.write(`${brightBlack(content)}\n`);
      stdout.write(`${brightBlack("--- end thinking ---")}\n\n`);
    },
    toggleLastThinking: () => {},
    toolStart: (name, args) => {
      const shortArgs = JSON.stringify(args).slice(0, 120);
      stdout.write(`\n${dim(`  ◆ ${name} ${shortArgs}`)}\n`);
    },
    toolEnd: (name, isError, result) => {
      const out = extractToolOutput(result);
      if (isError) {
        stdout.write(`${red(`  ◆ ${name} failed`)}\n`);
        if (out) stdout.write(`${red(`    ${out.slice(0, 200)}`)}\n`);
      } else if (out) {
        stdout.write(`${dim(`    ${out.split("\n")[0].slice(0, 200)}`)}\n`);
      }
    },
    textDelta: (delta) => { stdout.write(delta); },
    status: (text) => { stdout.write(`${brightBlack(`● ${text}`)}\n`); },
    setStatusBar: () => {},
    turnStart: () => {},
    turnEnd: () => {},
    summaryStart: () => {},
    summaryDone: () => {},
    retryStart: ({ attempt, maxAttempts, delayMs, errorMessage }) => {
      stdout.write(`${yellow(`● retrying (${attempt}/${maxAttempts}) in ${Math.ceil(delayMs / 1000)}s: ${errorMessage || "Unknown error"}`)}\n`);
    },
    retryEnd: ({ success, attempt, finalError }) => {
      const status = success ? "recovered" : "stopped";
      stdout.write(`${brightBlack(`● retry ${status} after ${attempt} attempt${attempt === 1 ? "" : "s"}${finalError ? `: ${finalError}` : ""}`)}\n`);
    },
    editDiff: (path, diffLines) => {
      stdout.write(`\n${dim(`  ± ${path}`)}\n`);
      for (const d of diffLines) {
        if (d.type === "del") stdout.write(`${red(`    - ${d.text}`)}\n`);
        else if (d.type === "add") stdout.write(`${green(`    + ${d.text}`)}\n`);
        else stdout.write(`${dim(`      ${d.text}`)}\n`);
      }
    },
    requestPermission: async () => true,
    setEscapeHandler: () => {},
    setCtrlCHandler: () => {},
    setShiftTabHandler: () => {},
    setCtrlTHandler: () => {},
    setCtrlLHandler: () => {},
    setPasteImageHandler: () => {},
    getInputText: () => "",
    insertTextAtCursor: () => {},
    openExternalEditor: () => {},
    toggleMouse: () => false,
    toggleToolOutput: () => false,
    requestExit: () => {},
    close: () => {},
  };
}
