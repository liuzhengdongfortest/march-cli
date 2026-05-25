import { strict as assert } from "node:assert";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export async function runSessionControllerLeaseSmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: session controller lease ---");
  const {
    SessionControllerLeaseConflictError,
    createSessionControllerLeaseManager,
    getSessionControllerLeasePath,
  } = await import("../src/session/control/controller-lease.mjs");

  const root = setupTmp();
  try {
    const sessionPath = join(root, ".march", "pi-sessions", "s-a.jsonl");
    const first = createSessionControllerLeaseManager({ instanceId: "owner-a", cwd: root, heartbeatMs: 0, ttlMs: 1_000, now: () => 1_000 });
    const second = createSessionControllerLeaseManager({ instanceId: "owner-b", cwd: root, heartbeatMs: 0, ttlMs: 1_000, now: () => 1_100 });

    const leaseA = first.acquire({ sessionId: "s-a", sessionPath });
    const leasePath = getSessionControllerLeasePath({ sessionId: "s-a", sessionPath });
    assert.equal(existsSync(leasePath), true);
    assert.throws(() => second.acquire({ sessionId: "s-a", sessionPath }), SessionControllerLeaseConflictError);

    const takeover = second.acquire({ sessionId: "s-a", sessionPath }, { force: true });
    assert.throws(() => leaseA.assertOwned(), SessionControllerLeaseConflictError);
    takeover.assertOwned();
    takeover.release();
    assert.equal(existsSync(leasePath), false);

    const stalePath = getSessionControllerLeasePath({ sessionId: "s-b", sessionPath: join(root, ".march", "pi-sessions", "s-b.jsonl") });
    mkdirSync(dirname(stalePath), { recursive: true });
    writeFileSync(stalePath, JSON.stringify({
      version: 1,
      token: "stale",
      sessionId: "s-b",
      owner: { instanceId: "old", pid: 1, cwd: root },
      expiresAt: new Date(500).toISOString(),
    }), "utf8");
    const staleLease = second.acquire({ sessionId: "s-b", sessionPath: join(root, ".march", "pi-sessions", "s-b.jsonl") });
    assert.equal(JSON.parse(readFileSync(stalePath, "utf8")).owner.instanceId, "owner-b");
    staleLease.release();
  } finally {
    cleanup(root);
  }
  console.log("  PASS");
}
