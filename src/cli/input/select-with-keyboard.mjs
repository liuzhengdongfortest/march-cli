import { createInterface } from "node:readline";

export async function selectWithKeyboard({ input = process.stdin, output = process.stdout, message, items }) {
  if (!items.length) return null;
  if (!input.isTTY || !output.isTTY || typeof input.setRawMode !== "function") {
    output.write(`${message}:\n`);
    for (let i = 0; i < items.length; i++) output.write(`  ${i + 1}. ${items[i].label}\n`);
    const answer = await readLine({ input, output, prompt: `Select (1-${items.length}): ` });
    const index = Number.parseInt(String(answer).trim(), 10) - 1;
    return items[index]?.value ?? null;
  }

  let selected = 0;
  let renderedLines = 0;
  const maxViewport = Math.max(4, (output.rows || 24) - 2);
  let viewportStart = 0;

  const viewportEnd = () => Math.min(viewportStart + maxViewport, items.length);

  const adjustViewport = () => {
    if (selected < viewportStart) viewportStart = selected;
    else if (selected >= viewportStart + maxViewport) viewportStart = selected - maxViewport + 1;
  };

  const render = () => {
    if (renderedLines > 0) output.write(`\x1b[${renderedLines}F`);
    const lines = formatSelectionList({ message, items, selected, viewportStart, viewportEnd: viewportEnd(), done: false });
    for (const line of lines) output.write(`\x1b[2K\r${line}\n`);
    renderedLines = lines.length;
  };
  return new Promise((resolve) => {
    let finished = false;
    const onData = (chunk) => {
      const keys = chunk.toString("utf8").match(/\u001b\[[AB]|\r|\n|\u0003|\u001b/g) ?? [];
      for (const key of keys) {
        if (finished) return;
        if (key === "\u0003" || key === "\u001b") finish(null);
        else if (key === "\r" || key === "\n") finish(items[selected].value);
        else if (key === "\u001b[A") { selected = (selected - 1 + items.length) % items.length; adjustViewport(); render(); }
        else if (key === "\u001b[B") { selected = (selected + 1) % items.length; adjustViewport(); render(); }
      }
    };
    const finish = (value) => {
      finished = true;
      input.off("data", onData);
      input.setRawMode(false);
      input.pause();
      if (renderedLines > 0) output.write(`\x1b[${renderedLines}F`);
      // final render shows just the selected item
      const lines = formatSelectionList({ message, items, selected, viewportStart: 0, viewportEnd: items.length, done: value != null });
      output.write(`\x1b[2K\r${lines[0]}\n`);
      output.write(`\x1b[2K\r  ${items[selected].label}\n`);
      resolve(value);
    };
    input.setRawMode(true);
    input.resume();
    input.on("data", onData);
    adjustViewport();
    render();
  });
}

export function formatSelectionList({ message, items, selected, viewportStart = 0, viewportEnd = items.length, done = false }) {
  const hint = done ? "selected" : "↑/↓, Enter";
  const lines = [`${message} (${hint})`];
  if (viewportStart > 0) lines.push("  …");
  for (let i = viewportStart; i < viewportEnd; i++) {
    const marker = i === selected ? "›" : " ";
    const label = `${marker} ${items[i].label}`;
    lines.push(i === selected ? `\x1b[7m${label}\x1b[0m` : label);
  }
  if (viewportEnd < items.length) lines.push("  …");
  return lines;
}

function readLine({ input = process.stdin, output = process.stdout, prompt }) {
  const rl = createInterface({ input, output });
  return new Promise((resolve) => rl.question(prompt, (answer) => {
    rl.close();
    resolve(answer);
  }));
}