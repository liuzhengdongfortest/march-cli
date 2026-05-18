import { strict as assert } from "node:assert";

export async function runStartupBannerSmoke() {
  console.log("--- smoke: startup banner ---");
  const { formatStartupBanner } = await import("../src/cli/startup/startup-banner.mjs");

  const plain = stripAnsi(formatStartupBanner({
    cwd: "D:/repo",
    modelId: "deepseek-v4-flash",
    thinkingLevel: "high",
    mode: "do",
  }).join("\n"));
  assert.ok(plain.includes("╭"));
  assert.ok(plain.includes("█▙  ▟█"));
  assert.ok(plain.includes("March v0.1.12"));
  assert.ok(plain.includes("Describe a task to get started."));
  assert.ok(plain.includes("Tip: Tab to Discuss · /help for commands"));
  assert.ok(plain.includes("March uses AI. Check for mistakes."));
  assert.equal(plain.includes("Terminal-native coding agent"), false);
  assert.equal(plain.includes("Workspace:"), false);
  assert.equal(plain.includes("deepseek-v4-flash · high"), false);
  assert.equal(plain.includes("D:/repo"), false);
  assert.equal(plain.includes("Do ·"), false);
  assert.equal(plain.includes("Starting March session"), false);
  assert.equal(plain.includes("March REPL. Type"), false);

  const withDump = stripAnsi(formatStartupBanner({
    cwd: "D:/repo",
    modelId: "model",
    thinkingLevel: "medium",
    mode: "discuss",
    dumpContextPath: ".march/context-dumps/session",
  }).join("\n"));
  assert.ok(withDump.includes("Tip: dumps: .march/context-dumps/session"));
  assert.ok(withDump.includes("March uses AI. Check for mistakes."));
  assert.equal(withDump.includes("Discuss ·"), false);
  assert.equal(withDump.includes("Tab to"), false);
  console.log("  PASS");
}

function stripAnsi(text) {
  return String(text).replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
}
