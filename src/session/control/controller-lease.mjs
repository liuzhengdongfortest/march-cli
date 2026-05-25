import { existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync, closeSync } from "node:fs";
import { randomUUID, createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { getMarchSessionStateDir, normalizeSessionId } from "../state/march-session-state.mjs";

export const DEFAULT_SESSION_CONTROLLER_LEASE_TTL_MS = 30_000;
export const DEFAULT_SESSION_CONTROLLER_HEARTBEAT_MS = 5_000;

export class SessionControllerLeaseConflictError extends Error {
  constructor({ sessionId, owner }) {
    super(formatControllerLeaseConflict({ sessionId, owner }));
    this.name = "SessionControllerLeaseConflictError";
    this.code = "SESSION_CONTROLLER_LEASE_CONFLICT";
    this.sessionId = sessionId;
    this.owner = owner;
  }
}

export function createSessionControllerLeaseManager({
  instanceId = randomUUID(),
  pid = process.pid,
  cwd = process.cwd(),
  now = () => Date.now(),
  ttlMs = DEFAULT_SESSION_CONTROLLER_LEASE_TTL_MS,
  heartbeatMs = DEFAULT_SESSION_CONTROLLER_HEARTBEAT_MS,
} = {}) {
  const ownerBase = { instanceId, pid, cwd: resolve(cwd) };

  return {
    instanceId,
    acquire(session, options = {}) {
      const target = resolveControllerLeaseTarget(session);
      const path = getSessionControllerLeasePath(target);
      const lease = writeLease({ path, target, ownerBase, now, ttlMs, force: Boolean(options.force) });
      const heartbeat = heartbeatMs > 0 ? setInterval(() => {
        try { refreshLease({ path, lease, now, ttlMs }); } catch {}
      }, heartbeatMs) : null;
      heartbeat?.unref?.();
      return {
        ...lease,
        path,
        target,
        assertOwned() {
          const current = readLease(path);
          if (!current || current.owner?.instanceId !== lease.owner.instanceId || current.token !== lease.token || isExpired(current, now())) {
            throw new SessionControllerLeaseConflictError({ sessionId: target.sessionId, owner: current?.owner ?? null });
          }
        },
        release() {
          if (heartbeat) clearInterval(heartbeat);
          releaseLease({ path, lease });
        },
      };
    },
  };
}

export function getSessionControllerLeasePath({ sessionId, sessionPath = null, projectMarchDir = null }) {
  if (sessionPath) {
    const identity = resolve(sessionPath);
    const key = createHash("sha256").update(identity).digest("hex").slice(0, 32);
    return join(dirname(identity), ".march-controller-leases", `${key}.json`);
  }
  if (!projectMarchDir || !sessionId) throw new Error("session controller lease requires a session path or project March dir plus session id");
  return join(getMarchSessionStateDir(projectMarchDir, sessionId), "controller-lease.json");
}

export function resolveControllerLeaseTarget({ sessionId, sessionPath = null, projectMarchDir = null }) {
  const id = normalizeSessionId(sessionId);
  return {
    sessionId: id,
    sessionPath: sessionPath ? resolve(sessionPath) : null,
    projectMarchDir: projectMarchDir ? resolve(projectMarchDir) : null,
  };
}

function writeLease({ path, target, ownerBase, now, ttlMs, force }) {
  mkdirSync(dirname(path), { recursive: true });
  const current = readLease(path);
  if (current && !force && !isExpired(current, now()) && current.owner?.instanceId !== ownerBase.instanceId) {
    throw new SessionControllerLeaseConflictError({ sessionId: target.sessionId, owner: current.owner });
  }
  const lease = createLease({ target, ownerBase, now, ttlMs });
  if (force || current) {
    writeFileSync(path, JSON.stringify(lease, null, 2), "utf8");
    return lease;
  }
  let fd = null;
  try {
    fd = openSync(path, "wx");
    writeFileSync(fd, JSON.stringify(lease, null, 2), "utf8");
    return lease;
  } catch {
    const raced = readLease(path);
    if (raced && !isExpired(raced, now())) throw new SessionControllerLeaseConflictError({ sessionId: target.sessionId, owner: raced.owner });
    try { unlinkSync(path); } catch {}
    writeFileSync(path, JSON.stringify(lease, null, 2), "utf8");
    return lease;
  } finally {
    if (fd !== null) closeSync(fd);
  }
}

function createLease({ target, ownerBase, now, ttlMs }) {
  const acquiredAtMs = now();
  return {
    version: 1,
    token: randomUUID(),
    sessionId: target.sessionId,
    sessionPath: target.sessionPath,
    owner: ownerBase,
    acquiredAt: new Date(acquiredAtMs).toISOString(),
    heartbeatAt: new Date(acquiredAtMs).toISOString(),
    expiresAt: new Date(acquiredAtMs + ttlMs).toISOString(),
  };
}

function refreshLease({ path, lease, now, ttlMs }) {
  const current = readLease(path);
  if (!current || current.token !== lease.token || current.owner?.instanceId !== lease.owner.instanceId) return;
  const heartbeatAtMs = now();
  writeFileSync(path, JSON.stringify({
    ...current,
    heartbeatAt: new Date(heartbeatAtMs).toISOString(),
    expiresAt: new Date(heartbeatAtMs + ttlMs).toISOString(),
  }, null, 2), "utf8");
}

function releaseLease({ path, lease }) {
  const current = readLease(path);
  if (!current || current.token !== lease.token || current.owner?.instanceId !== lease.owner.instanceId) return;
  try { unlinkSync(path); } catch {}
}

function readLease(path) {
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return null; }
}

function isExpired(lease, nowMs) {
  return Date.parse(lease.expiresAt ?? 0) <= nowMs;
}

function formatControllerLeaseConflict({ sessionId, owner }) {
  const parts = [`Session "${sessionId}" is already controlled by another March instance.`];
  if (owner?.cwd) parts.push(`cwd: ${owner.cwd}`);
  if (owner?.pid) parts.push(`pid: ${owner.pid}`);
  return parts.join(" ");
}
