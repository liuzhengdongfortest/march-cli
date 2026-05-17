import {
  SUPERGROK_OAUTH_PROVIDER_ID,
  XAI_API_PROVIDER_ID,
  XAI_BASE_URL,
  XAI_OAUTH_COMPAT_PROVIDER_ID,
} from "./constants.mjs";
import { registerSuperGrokOAuthProvider } from "./oauth-provider.mjs";

export async function resolveSuperGrokCredentials({ authStorage, baseUrl = XAI_BASE_URL } = {}) {
  registerSuperGrokOAuthProvider();

  for (const providerId of [SUPERGROK_OAUTH_PROVIDER_ID, XAI_OAUTH_COMPAT_PROVIDER_ID]) {
    const apiKey = await authStorage?.getApiKey?.(providerId, { includeFallback: false });
    if (apiKey) {
      const credentials = authStorage?.get?.(providerId) ?? {};
      return {
        provider: "xai",
        credentialSource: providerId,
        apiKey,
        baseUrl: String(credentials.baseUrl || baseUrl).replace(/\/$/, ""),
      };
    }
  }

  const apiKey = await authStorage?.getApiKey?.(XAI_API_PROVIDER_ID, { includeFallback: true });
  if (apiKey) {
    return {
      provider: "xai",
      credentialSource: XAI_API_PROVIDER_ID,
      apiKey,
      baseUrl: String(baseUrl).replace(/\/$/, ""),
    };
  }

  throw new Error("No SuperGrok credentials available. Run: march login supergrok-oauth, or configure XAI_API_KEY / xai provider.");
}
