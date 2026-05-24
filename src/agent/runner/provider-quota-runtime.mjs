import { createProviderQuotaService } from "../../provider/quota/index.mjs";
import { installProviderQuotaTransportObserver, subscribeProviderQuotaTransport } from "../../provider/quota/transport-observer.mjs";

export function createRunnerProviderQuotaRuntime({ authStorage, getCurrentModel, ui } = {}) {
  installProviderQuotaTransportObserver();
  const providerQuota = createProviderQuotaService({ authStorage });
  let lastSnapshot = null;
  const unsubscribeTransport = subscribeProviderQuotaTransport((event) => {
    const model = getCurrentModel?.();
    if (!providerQuota.supports(model?.provider) || event.providerId !== model.provider) return;
    const snapshot = event.source === "headers"
      ? providerQuota.observeHeaders(event.headers, model)
      : providerQuota.observeEvent(event.payload, model);
    if (!snapshot) return;
    lastSnapshot = snapshot;
    ui?.providerQuotaSnapshot?.(lastSnapshot);
  });

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
    disposeProviderQuotaRuntime() {
      unsubscribeTransport();
    },
  };
}
