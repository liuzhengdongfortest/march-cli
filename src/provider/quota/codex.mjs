import { getOAuthProvider } from "@earendil-works/pi-ai/oauth";

const CODEX_USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
const JWT_CLAIM_PATH = "https://api.openai.com/auth";

export async function fetchOpenAICodexQuota({ authStorage, model, fetchImpl = fetch, now = new Date() } = {}) {
  const token = await resolveCodexAccessToken(authStorage);
  const accountId = resolveCodexAccountId(authStorage, token);
  const response = await fetchImpl(CODEX_USAGE_URL, {
    method: "GET",
    headers: buildCodexUsageHeaders(token, accountId),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Codex quota request failed (${response.status}): ${text || response.statusText}`);
  }
  const payload = await response.json();
  return normalizeCodexQuotaPayload(payload, { model, capturedAt: now.toISOString() });
}

export function normalizeCodexQuotaPayload(payload, { model = null, capturedAt = new Date().toISOString() } = {}) {
  const snapshots = Array.isArray(payload) ? payload : snapshotsFromCodexUsagePayload(payload);
  return normalizeCodexQuotaSnapshots(snapshots, { model, capturedAt });
}

export function normalizeCodexQuotaSnapshots(snapshots, { model = null, capturedAt = new Date().toISOString() } = {}) {
  const limits = snapshots.map(normalizeSnapshot).filter((limit) => limit.windows.length > 0);
  if (limits.length === 0) return null;
  return {
    providerId: "openai-codex",
    modelId: model?.id ?? null,
    label: "GPT usage",
    planType: firstNonEmpty(snapshots.map((snapshot) => readField(snapshot, "planType", "plan_type"))),
    capturedAt,
    limits,
  };
}

export function parseOpenAICodexQuotaHeaders(headers, { model = null, capturedAt = new Date().toISOString() } = {}) {
  const normalized = normalizeHeaders(headers);
  const limitIds = new Set(["codex"]);
  for (const name of Object.keys(normalized)) {
    const prefix = name.endsWith("-primary-used-percent") ? name.slice(2, -"-primary-used-percent".length) : null;
    if (prefix) limitIds.add(prefix.replaceAll("-", "_"));
  }
  const snapshots = [...limitIds]
    .map((limitId) => snapshotFromHeaders(normalized, limitId))
    .filter((snapshot) => snapshot.primary || snapshot.secondary || snapshot.credits);
  return normalizeCodexQuotaSnapshots(snapshots, { model, capturedAt });
}

export function parseOpenAICodexQuotaEvent(payload, { model = null, capturedAt = new Date().toISOString() } = {}) {
  const event = typeof payload === "string" ? parseJson(payload) : payload;
  if (!event || event.type !== "codex.rate_limits") return null;
  const snapshot = {
    limitId: readField(event, "metered_limit_name", "limit_name") ?? "codex",
    limitName: null,
    primary: mapWindow(readField(readField(event, "rate_limits", "rateLimits"), "primary")),
    secondary: mapWindow(readField(readField(event, "rate_limits", "rateLimits"), "secondary")),
    credits: readField(event, "credits") ?? null,
    planType: readField(event, "plan_type", "planType") ?? null,
    rateLimitReachedType: null,
  };
  return normalizeCodexQuotaSnapshots([snapshot], { model, capturedAt });
}

async function resolveCodexAccessToken(authStorage) {
  const token = await authStorage?.getApiKey?.("openai-codex", { includeFallback: false });
  if (token) return token;
  const credentials = authStorage?.get?.("openai-codex");
  if (!credentials) throw new Error("OpenAI Codex not authenticated. Run: march login openai-codex");
  const provider = getOAuthProvider("openai-codex");
  if (!provider) throw new Error("OpenAI Codex OAuth provider is not available");
  return provider.getApiKey(credentials);
}

function resolveCodexAccountId(authStorage, token) {
  const credentials = authStorage?.get?.("openai-codex");
  return credentials?.accountId ?? credentials?.chatgpt_account_id ?? extractAccountId(token);
}

function extractAccountId(token) {
  try {
    const [, payload] = String(token).split(".");
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    const accountId = parsed?.[JWT_CLAIM_PATH]?.chatgpt_account_id;
    if (typeof accountId === "string" && accountId) return accountId;
  } catch {}
  throw new Error("Failed to extract Codex account ID from token");
}

function buildCodexUsageHeaders(token, accountId) {
  return {
    authorization: `Bearer ${token}`,
    "chatgpt-account-id": accountId,
    originator: "march",
    "user-agent": "march-cli",
    accept: "application/json",
  };
}

function snapshotsFromCodexUsagePayload(payload) {
  if (!payload || typeof payload !== "object") return [];
  const planType = readField(payload, "planType", "plan_type") ?? null;
  const reached = readField(payload, "rateLimitReachedType", "rate_limit_reached_type") ?? null;
  const snapshots = [makeSnapshot({
    limitId: "codex",
    limitName: null,
    rateLimit: unwrap(readField(payload, "rateLimit", "rate_limit")),
    credits: unwrap(readField(payload, "credits")),
    planType,
    rateLimitReachedType: unwrap(reached)?.kind ?? reached,
  })];
  const additional = readField(payload, "additionalRateLimits", "additional_rate_limits");
  if (Array.isArray(additional)) {
    for (const item of additional) {
      snapshots.push(makeSnapshot({
        limitId: readField(item, "meteredFeature", "metered_feature"),
        limitName: readField(item, "limitName", "limit_name"),
        rateLimit: unwrap(readField(item, "rateLimit", "rate_limit")),
        credits: null,
        planType,
        rateLimitReachedType: null,
      }));
    }
  }
  return snapshots;
}

function makeSnapshot({ limitId, limitName, rateLimit, credits, planType, rateLimitReachedType }) {
  return {
    limitId: limitId ?? null,
    limitName: limitName ?? null,
    primary: mapWindow(readField(rateLimit, "primary", "primaryWindow", "primary_window")),
    secondary: mapWindow(readField(rateLimit, "secondary", "secondaryWindow", "secondary_window")),
    credits: credits ?? null,
    planType,
    rateLimitReachedType,
  };
}

function snapshotFromHeaders(headers, limitId) {
  const headerPrefix = `x-${limitId.replaceAll("_", "-")}`;
  return {
    limitId,
    limitName: readHeader(headers, `${headerPrefix}-limit-name`),
    primary: windowFromHeaders(headers, headerPrefix, "primary"),
    secondary: windowFromHeaders(headers, headerPrefix, "secondary"),
    credits: limitId === "codex" ? creditsFromHeaders(headers) : null,
    planType: null,
    rateLimitReachedType: null,
  };
}

function windowFromHeaders(headers, prefix, windowId) {
  const usedPercent = readHeader(headers, `${prefix}-${windowId}-used-percent`);
  if (usedPercent === undefined) return null;
  return {
    usedPercent,
    windowDurationMins: readHeader(headers, `${prefix}-${windowId}-window-minutes`),
    resetsAt: readHeader(headers, `${prefix}-${windowId}-reset-at`),
  };
}

function creditsFromHeaders(headers) {
  const hasCredits = parseHeaderBool(readHeader(headers, "x-codex-credits-has-credits"));
  const unlimited = parseHeaderBool(readHeader(headers, "x-codex-credits-unlimited"));
  if (hasCredits === null || unlimited === null) return null;
  return { hasCredits, unlimited, balance: readHeader(headers, "x-codex-credits-balance") ?? null };
}

function normalizeSnapshot(snapshot) {
  const id = readField(snapshot, "limitId", "limit_id") ?? "quota";
  return {
    id,
    name: readField(snapshot, "limitName", "limit_name") ?? id,
    windows: [
      normalizeWindow("primary", readField(snapshot, "primary")),
      normalizeWindow("secondary", readField(snapshot, "secondary")),
    ].filter(Boolean),
    rateLimitReachedType: readField(snapshot, "rateLimitReachedType", "rate_limit_reached_type") ?? null,
  };
}

function normalizeWindow(id, window) {
  const normalized = mapWindow(window);
  if (!normalized) return null;
  const label = formatWindowLabel(normalized.windowDurationMins, id);
  return {
    id,
    label,
    usedPercent: normalized.usedPercent,
    remainingPercent: Math.max(0, 100 - normalized.usedPercent),
    windowDurationMins: normalized.windowDurationMins,
    resetsAt: normalized.resetsAt,
  };
}

function mapWindow(window) {
  const unwrapped = unwrap(window);
  if (!unwrapped || typeof unwrapped !== "object") return null;
  const rawUsed = readField(unwrapped, "usedPercent", "used_percent");
  const usedPercent = Number(rawUsed);
  if (!Number.isFinite(usedPercent)) return null;
  const rawMinutes = readField(unwrapped, "windowDurationMins", "window_minutes", "windowDurationMinutes");
  const rawSeconds = readField(unwrapped, "limitWindowSeconds", "limit_window_seconds");
  return {
    usedPercent,
    windowDurationMins: normalizeWindowMinutes(rawMinutes, rawSeconds),
    resetsAt: normalizeResetTime(readField(unwrapped, "resetsAt", "resets_at", "resetAt", "reset_at")),
  };
}

function normalizeWindowMinutes(minutes, seconds) {
  const minuteValue = Number(minutes);
  if (Number.isFinite(minuteValue) && minuteValue > 0) return minuteValue;
  const secondValue = Number(seconds);
  return Number.isFinite(secondValue) && secondValue > 0 ? Math.round(secondValue / 60) : null;
}

function normalizeResetTime(value) {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    const millis = numeric < 10_000_000_000 ? numeric * 1000 : numeric;
    return new Date(millis).toISOString();
  }
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function formatWindowLabel(minutes, fallback) {
  if (!Number.isFinite(minutes) || minutes <= 0) return fallback;
  if (minutes % (60 * 24 * 7) === 0) return "weekly";
  if (minutes % 60 === 0) return `${minutes / 60}h`;
  return `${minutes}m`;
}

function unwrap(value) {
  return Array.isArray(value) && value.length === 1 ? value[0] : value;
}

function readField(object, ...keys) {
  if (!object || typeof object !== "object") return undefined;
  for (const key of keys) if (Object.hasOwn(object, key)) return object[key];
  return undefined;
}

function normalizeHeaders(headers) {
  if (!headers) return {};
  if (typeof headers.entries === "function") {
    return Object.fromEntries([...headers.entries()].map(([key, value]) => [key.toLowerCase(), String(value)]));
  }
  return Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), String(value)]));
}

function readHeader(headers, name) {
  const value = headers[name.toLowerCase()];
  return value === undefined || value === "" ? undefined : value;
}

function parseHeaderBool(value) {
  if (value === undefined) return null;
  if (value === "1" || value.toLowerCase() === "true") return true;
  if (value === "0" || value.toLowerCase() === "false") return false;
  return null;
}

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function firstNonEmpty(values) {
  return values.find((value) => value !== null && value !== undefined && value !== "") ?? null;
}
