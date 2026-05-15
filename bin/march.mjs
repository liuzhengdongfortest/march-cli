#!/usr/bin/env node

process.on("warning", (warning) => {
  if (warning?.name === "ExperimentalWarning" && String(warning.message).includes("SQLite")) return;
  process.stderr.write(`${warning.name}: ${warning.message}\n`);
});

const { run } = await import("../src/main.mjs");
const code = await run(process.argv.slice(2));
process.exit(code);
