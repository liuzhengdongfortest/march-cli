import { createProviderQuotaService } from "../../provider/quota/index.mjs";

export function createRunnerProviderQuotaRuntime({ authStorage, getCurrentModel, ui } = {}) {
  const providerQuota = createProviderQuotaService({ authStorage });
  let lastSnapshot = null;

  return {
    getCachedProviderQuotaSnapshot() {
      return lastSnapshot;
    },
    async getProviderQuotaSnapshot({ emit = false } = {}) {
      const model = getCurrentModel?.();
      if (!providerQuota.supports(model?.provider)) {
        lastSnapshot = null;
        if (emit) ui?.providerQuotaSnapshot?.(null);
        return null;
      }
      lastSnapshot = await providerQuota.refresh(model);
      if (emit) ui?.providerQuotaSnapshot?.(lastSnapshot);
      return lastSnapshot;
    },
  };
}
