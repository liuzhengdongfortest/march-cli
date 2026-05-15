#!/usr/bin/env node

const emitWarning = process.emitWarning;
process.emitWarning = function filteredWarning(warning, ...args) {
  const message = typeof warning === "string" ? warning : warning?.message;
  const type = typeof warning === "string" ? args[0] : warning?.name;
  if (type === "ExperimentalWarning" && String(message).includes("SQLite")) return;
  return emitWarning.call(this, warning, ...args);
};

const { run } = await import("../src/main.mjs");
const code = await run(process.argv.slice(2));
process.exit(code);
