import { strict as assert } from "node:assert";

export async function runProviderQuotaSmoke() {
  console.log("--- smoke: provider quota capability ---");
  const { normalizeCodexQuotaPayload, parseOpenAICodexQuotaEvent, parseOpenAICodexQuotaHeaders } = await import("../src/provider/quota/codex.mjs");
  const { getProviderQuotaSnapshot, observeProviderQuotaEvent, observeProviderQuotaHeaders, supportsProviderQuota } = await import("../src/provider/quota/index.mjs");

  assert.equal(supportsProviderQuota("openai-codex"), true);
  assert.equal(supportsProviderQuota("deepseek"), false);
  assert.equal(await getProviderQuotaSnapshot({ providerId: "deepseek" }), null);

  const snapshot = normalizeCodexQuotaPayload({
    plan_type: "plus",
    rate_limit: {
      primary_window: { used_percent: 42, limit_window_seconds: 18_000, reset_at: 1_800_000_000 },
      secondary_window: { used_percent: 84, limit_window_seconds: 604_800, reset_at: 1_800_086_400 },
    },
    additional_rate_limits: [{
      limit_name: "Other",
      metered_feature: "codex_other",
      rate_limit: { primary_window: { used_percent: 70, limit_window_seconds: 900, reset_at: 1_800_000_900 } },
    }],
  }, { model: { id: "gpt-5", provider: "openai-codex" }, capturedAt: "2026-05-24T00:00:00.000Z" });

  assert.equal(snapshot.providerId, "openai-codex");
  assert.equal(snapshot.modelId, "gpt-5");
  assert.equal(snapshot.planType, "plus");
  assert.equal(snapshot.limits[0].id, "codex");
  assert.equal(snapshot.limits[0].windows[0].label, "5h");
  assert.equal(snapshot.limits[0].windows[0].usedPercent, 42);
  assert.equal(snapshot.limits[0].windows[0].remainingPercent, 58);
  assert.equal(snapshot.limits[0].windows[1].label, "weekly");
  assert.equal(snapshot.limits[1].id, "codex_other");

  const headerSnapshot = parseOpenAICodexQuotaHeaders({
    "x-codex-primary-used-percent": "40",
    "x-codex-primary-window-minutes": "300",
    "x-codex-primary-reset-at": "1800000000",
    "x-codex-secondary-primary-used-percent": "65",
    "x-codex-secondary-primary-window-minutes": "10080",
    "x-codex-secondary-limit-name": "Secondary",
  }, { model: { id: "gpt-5", provider: "openai-codex" }, capturedAt: "2026-05-24T00:00:00.000Z" });
  assert.equal(headerSnapshot.limits[0].windows[0].label, "5h");
  assert.equal(headerSnapshot.limits[1].id, "codex_secondary");
  assert.equal(headerSnapshot.limits[1].name, "Secondary");

  const eventSnapshot = parseOpenAICodexQuotaEvent(JSON.stringify({
    type: "codex.rate_limits",
    plan_type: "pro",
    rate_limits: { primary: { used_percent: 91, window_minutes: 300, reset_at: 1800000000 } },
  }), { model: { id: "gpt-5", provider: "openai-codex" }, capturedAt: "2026-05-24T00:00:00.000Z" });
  assert.equal(eventSnapshot.planType, "pro");
  assert.equal(eventSnapshot.limits[0].windows[0].usedPercent, 91);

  assert.equal(observeProviderQuotaHeaders({ providerId: "deepseek", headers: {} }), null);
  assert.equal(observeProviderQuotaEvent({ providerId: "deepseek", payload: {} }), null);
  console.log("  PASS");
}
