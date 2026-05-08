import { createInterface } from "node:readline";
import { stdin, stdout } from "node:process";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const SPINNER_INTERVAL = 80;

export function createUI({ json }) {
  if (json) return createJsonUI();

  const rl = createInterface({ input: stdin, output: stdout });
  let spinnerTimer = null;
  let spinnerIdx = 0;
  let spinning = false;

  function stopSpinner() {
    if (spinnerTimer) {
      clearInterval(spinnerTimer);
      spinnerTimer = null;
    }
    if (spinning) {
      stdout.write("\r\x1b[K"); // clear spinner line
      spinning = false;
    }
  }

  function startSpinner(text) {
    stopSpinner();
    spinning = true;
    stdout.write(`\x1b[90m${SPINNER_FRAMES[0]} ${text}\x1b[0m`);
    spinnerTimer = setInterval(() => {
      spinnerIdx = (spinnerIdx + 1) % SPINNER_FRAMES.length;
      stdout.write(`\r\x1b[90m${SPINNER_FRAMES[spinnerIdx]} ${text}\x1b[0m`);
    }, SPINNER_INTERVAL);
  }

  return {
    readline: (prompt) =>
      new Promise((resolve) => {
        rl.question(prompt, (line) => {
          resolve(line);
        });
      }),

    write: (text) => {
      stdout.write(text);
    },

    writeln: (text) => {
      stdout.write(text + "\n");
    },

    toolStart: (name, args) => {
      stopSpinner();
      const shortArgs = JSON.stringify(args).slice(0, 120);
      stdout.write(`\x1b[2m  ◆ ${name} ${shortArgs}\x1b[0m\n`);
    },

    toolEnd: (name, isError) => {
      if (isError) {
        stdout.write(`\x1b[31m  ◆ ${name} failed\x1b[0m\n`);
      }
    },

    textDelta: (delta) => {
      stopSpinner();
      stdout.write(delta);
    },

    status: (text) => {
      stopSpinner();
      stdout.write(`\x1b[90m● ${text}\x1b[0m\n`);
    },

    turnStart: () => {
      startSpinner("Thinking...");
    },

    turnEnd: () => {
      stopSpinner();
    },

    editDiff: (path, diffLines) => {
      stopSpinner();
      stdout.write(`\x1b[2m  ± ${path}\x1b[0m\n`);
      for (const d of diffLines) {
        if (d.type === "del") {
          stdout.write(`\x1b[31m    - ${d.text}\x1b[0m\n`);
        } else if (d.type === "add") {
          stdout.write(`\x1b[32m    + ${d.text}\x1b[0m\n`);
        } else {
          stdout.write(`\x1b[2m      ${d.text}\x1b[0m\n`);
        }
      }
    },

    close: () => {
      stopSpinner();
      rl.close();
    },
  };
}

function createJsonUI() {
  return {
    readline: () => Promise.resolve(""),
    write: () => {},
    writeln: (text) => {
      stdout.write(text + "\n");
    },
    toolStart: (name, args) => {
      stdout.write(JSON.stringify({ type: "tool_start", name, args }) + "\n");
    },
    toolEnd: (name, isError) => {
      stdout.write(JSON.stringify({ type: "tool_end", name, isError }) + "\n");
    },
    textDelta: (delta) => {
      stdout.write(delta);
    },
    status: () => {},
    turnStart: () => {},
    turnEnd: () => {},
    editDiff: (path, diffLines) => {
      stdout.write(JSON.stringify({ type: "edit_diff", path, diff: diffLines }) + "\n");
    },
    close: () => {},
  };
}
