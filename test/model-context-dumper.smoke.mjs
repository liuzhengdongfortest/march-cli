import { strict as assert } from "node:assert";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export async function runModelContextDumperSmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: model context dumper ---");
  const { createModelContextDumper } = await import("../src/debug/model-context-dumper.mjs");
  const dir = setupTmp();
  const dumpDir = join(dir, "context-dumps", "session-a");
  const dates = [
    new Date("2026-05-14T10:23:45.123Z"),
    new Date("2026-05-14T10:23:46.456Z"),
  ];
  const dumper = createModelContextDumper({
    enabled: true,
    rootDir: dumpDir,
    now: () => dates.shift(),
  });

  const first = dumper.dump({
    kind: "user",
    prompt: "[system]\nA\n\n[user]\nhello",
    metadata: { provider: "deepseek", model: "test-model", attachments: 0 },
  });
  const second = dumper.dump({ kind: "summary", prompt: "[system]\nsummary" });

  assert.ok(existsSync(first));
  assert.ok(existsSync(second));
  assert.deepEqual(readdirSync(dumpDir), [
    "2026-05-14T10-23-45-123Z-0001-user.md",
    "2026-05-14T10-23-46-456Z-0002-summary.md",
  ]);
  const content = readFileSync(first, "utf8");
  assert.ok(content.includes('kind: "user"'));
  assert.ok(content.includes('provider: "deepseek"'));
  assert.ok(content.endsWith("[system]\nA\n\n[user]\nhello"));

  const disabled = createModelContextDumper({ enabled: false, rootDir: join(dir, "disabled") });
  assert.equal(disabled.dump({ kind: "user", prompt: "x" }), null);

  cleanup(dir);
  console.log("  PASS");
}
