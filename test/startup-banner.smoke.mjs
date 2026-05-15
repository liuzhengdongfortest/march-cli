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
  assert.ok(plain.includes("█▙  ▟█"));
  assert.ok(plain.includes("March"));
  assert.ok(plain.includes("deepseek-v4-flash · high"));
  assert.ok(plain.includes("D:/repo"));
  assert.ok(plain.includes("Tab to Discuss · /help"));
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
  assert.ok(withDump.includes("dumps: .march/context-dumps/session"));
  assert.equal(withDump.includes("Discuss ·"), false);
  assert.equal(withDump.includes("Tab to"), false);
  console.log("  PASS");
}

function stripAnsi(text) {
  return String(text).replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
}
