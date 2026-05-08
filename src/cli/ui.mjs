import { createInterface } from "node:readline";
import { stdin, stdout } from "node:process";

export function createUI({ json }) {
  if (json) return createJsonUI();

  const rl = createInterface({ input: stdin, output: stdout });

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
      const shortArgs = JSON.stringify(args).slice(0, 120);
      stdout.write(`\x1b[2m  ${name} ${shortArgs}\x1b[0m\n`);
    },

    toolEnd: (name, isError) => {
      if (isError) {
        stdout.write(`\x1b[31m  ${name} failed\x1b[0m\n`);
      }
    },

    textDelta: (delta) => {
      stdout.write(delta);
    },

    status: (text) => {
      stdout.write(`\x1b[90m● ${text}\x1b[0m\n`);
    },

    close: () => {
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
    close: () => {},
  };
}
