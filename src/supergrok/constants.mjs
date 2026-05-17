export const SUPERGROK_OAUTH_PROVIDER_ID = "supergrok-oauth";
export const XAI_OAUTH_COMPAT_PROVIDER_ID = "xai-oauth";
export const XAI_API_PROVIDER_ID = "xai";

export const XAI_BASE_URL = "https://api.x.ai/v1";
export const XAI_OAUTH_ISSUER = "https://auth.x.ai";
export const XAI_OAUTH_DISCOVERY_URL = `${XAI_OAUTH_ISSUER}/.well-known/openid-configuration`;

// Hermes/Grok CLI client id. xAI currently ties SuperGrok subscription access to this public client.
export const XAI_OAUTH_CLIENT_ID = "b1a00492-073a-47ea-816f-4c329264a828";
export const XAI_OAUTH_SCOPE = "openid profile email offline_access grok-cli:access api:access";
export const XAI_OAUTH_REDIRECT_HOST = "127.0.0.1";
export const XAI_OAUTH_REDIRECT_PORT = 56121;
export const XAI_OAUTH_REDIRECT_PATH = "/callback";

export const DEFAULT_SUPERGROK_MODEL = "grok-4.3";
export const DEFAULT_SUPERGROK_SEARCH_MODEL = "grok-4.3";
export const DEFAULT_SUPERGROK_IMAGE_MODEL = "grok-imagine-image";
