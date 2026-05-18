import { appendFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const LEVELS = Object.freeze({ debug: 10, info: 20, warn: 30, error: 40, silent: 99 });
const REDACTED = "[redacted]";
const MAX_STRING_LENGTH = 2000;
const MAX_ARRAY_LENGTH = 50;
const MAX_OBJECT_KEYS = 80;
const SENSITIVE_KEY = /(api[-_]?key|authorization|auth|token|secret|password|cookie|credential|b64|base64|image)/i;

export function createLogger({
  enabled = process.env.MARCH_LOG !== "0",
  level = process.env.MARCH_LOG_LEVEL ?? "info",
  logDir = defaultLogDir(),
  now = () => new Date(),
  pid = process.pid,
} = {}) {
  const threshold = normalizeLevel(level);
  const path = join(logDir, `${dateStamp(now())}-march-${pid}.jsonl`);
  const base = { enabled: Boolean(enabled), level: levelName(threshold), path };

  function write(levelNameValue, event, fields = {}) {
    if (!base.enabled || normalizeLevel(levelNameValue) < threshold) return;
    const entry = {
      ts: now().toISOString(),
      level: levelNameValue,
      event,
      pid,
      ...sanitize(fields),
    };
    try {
      mkdirSync(logDir, { recursive: true });
      appendFileSync(path, `${JSON.stringify(entry)}\n`, "utf8");
    } catch {
      // Logging must never change CLI behavior.
    }
  }

  const logger = {
    ...base,
    event: (event, fields) => write("info", event, fields),
    debug: (event, fields) => write("debug", event, fields),
    warn: (event, fields) => write("warn", event, fields),
    error: (event, fields) => write("error", event, fields),
    child(extraFields = {}) {
      return createChildLogger(logger, sanitize(extraFields));
    },
  };
  return logger;
}

export function createHeartbeat({ logger, event = "heartbeat", intervalMs = 10_000, getFields = () => ({}) } = {}) {
  if (!logger?.enabled || intervalMs <= 0) return { stop() {} };
  const timer = setInterval(() => logger.event(event, getFields()), intervalMs);
  timer.unref?.();
  return {
    stop() { clearInterval(timer); },
  };
}

export function installProcessLogHandlers(logger) {
  if (!logger?.enabled) return;
  process.once("uncaughtException", (err) => {
    logger.error("process.uncaughtException", { error: formatError(err) });
  });
  process.once("unhandledRejection", (reason) => {
    logger.error("process.unhandledRejection", { error: formatError(reason) });
  });
}

export function formatError(err) {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      stack: err.stack,
    };
  }
  return { message: String(err) };
}

export function sanitize(value, seen = new WeakSet(), key = "") {
  if (SENSITIVE_KEY.test(key)) return REDACTED;
  if (value == null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return truncateString(value);
  if (typeof value === "bigint") return String(value);
  if (typeof value === "function" || typeof value === "symbol") return `[${typeof value}]`;
  if (value instanceof Error) return sanitize(formatError(value), seen);
  if (typeof value !== "object") return String(value);
  if (seen.has(value)) return "[circular]";
  seen.add(value);
  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ARRAY_LENGTH).map((item) => sanitize(item, seen));
    if (value.length > MAX_ARRAY_LENGTH) items.push(`[${value.length - MAX_ARRAY_LENGTH} more items]`);
    return items;
  }
  const entries = Object.entries(value).slice(0, MAX_OBJECT_KEYS);
  const out = {};
  for (const [entryKey, entryValue] of entries) out[entryKey] = sanitize(entryValue, seen, entryKey);
  const omitted = Object.keys(value).length - entries.length;
  if (omitted > 0) out.__omittedKeys = omitted;
  return out;
}

function createChildLogger(parent, extraFields) {
  function withFields(fields) {
    return { ...extraFields, ...(fields ?? {}) };
  }
  return {
    enabled: parent.enabled,
    level: parent.level,
    path: parent.path,
    event: (event, fields) => parent.event(event, withFields(fields)),
    debug: (event, fields) => parent.debug(event, withFields(fields)),
    warn: (event, fields) => parent.warn(event, withFields(fields)),
    error: (event, fields) => parent.error(event, withFields(fields)),
    child: (fields = {}) => createChildLogger(parent, withFields(sanitize(fields))),
  };
}

function defaultLogDir() {
  return join(homedir(), ".march", "logs");
}

function dateStamp(now) {
  return now.toISOString().slice(0, 10);
}

function truncateString(value) {
  if (value.length <= MAX_STRING_LENGTH) return value;
  return `${value.slice(0, MAX_STRING_LENGTH)}...[truncated ${value.length - MAX_STRING_LENGTH} chars]`;
}

function normalizeLevel(level) {
  return LEVELS[String(level).toLowerCase()] ?? LEVELS.info;
}

function levelName(value) {
  return Object.entries(LEVELS).find(([, level]) => level === value)?.[0] ?? "info";
}
