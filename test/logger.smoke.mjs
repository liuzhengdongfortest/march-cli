import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createHeartbeat, createLogger, sanitize } from "../src/debug/logger.mjs";

export async function runLoggerSmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: unified logger ---");
  const dir = setupTmp();
  try {
    const logger = createLogger({ logDir: join(dir, "logs"), now: fixedNow(), pid: 1234 });
    logger.event("test.event", {
      apiKey: "secret-key",
      nested: { authorization: "Bearer secret", ok: true },
      long: "x".repeat(2100),
    });

    assert.ok(existsSync(logger.path));
    const line = readFileSync(logger.path, "utf8").trim();
    const entry = JSON.parse(line);
    assert.equal(entry.event, "test.event");
    assert.equal(entry.apiKey, "[redacted]");
    assert.equal(entry.nested.authorization, "[redacted]");
    assert.equal(entry.nested.ok, true);
    assert.ok(entry.long.includes("[truncated"));

    let ticks = 0;
    const heartbeat = createHeartbeat({
      logger,
      event: "test.heartbeat",
      intervalMs: 1,
      getFields: () => ({ ticks: ++ticks }),
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    heartbeat.stop();
    const events = readFileSync(logger.path, "utf8").trim().split("\n").map((item) => JSON.parse(item).event);
    assert.ok(events.includes("test.heartbeat"));

    const circular = {};
    circular.self = circular;
    assert.equal(sanitize(circular).self, "[circular]");
    console.log("  PASS");
  } finally {
    cleanup(dir);
  }
}

function fixedNow() {
  return () => new Date("2026-05-18T00:00:00.000Z");
}
