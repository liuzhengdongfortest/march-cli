import { createHash, randomBytes } from "node:crypto";
import http from "node:http";
import { registerOAuthProvider } from "@earendil-works/pi-ai/oauth";
import {
  SUPERGROK_OAUTH_PROVIDER_ID,
  XAI_BASE_URL,
  XAI_OAUTH_CLIENT_ID,
  XAI_OAUTH_DISCOVERY_URL,
  XAI_OAUTH_REDIRECT_HOST,
  XAI_OAUTH_REDIRECT_PATH,
  XAI_OAUTH_REDIRECT_PORT,
  XAI_OAUTH_SCOPE,
  XAI_OAUTH_COMPAT_PROVIDER_ID,
} from "./constants.mjs";

export function registerSuperGrokOAuthProvider() {
  registerOAuthProvider(superGrokOAuthProvider);
  registerOAuthProvider({ ...superGrokOAuthProvider, id: XAI_OAUTH_COMPAT_PROVIDER_ID });
}

export const superGrokOAuthProvider = {
  id: SUPERGROK_OAUTH_PROVIDER_ID,
  name: "SuperGrok OAuth (xAI Subscription)",
  usesCallbackServer: true,
  async login(callbacks) {
    return loginSuperGrok(callbacks);
  },
  async refreshToken(credentials) {
    return refreshSuperGrokToken(credentials);
  },
  getApiKey(credentials) {
    return credentials.access;
  },
};

async function loginSuperGrok(callbacks) {
  const discovery = await discoverXaiOAuth();
  const verifier = createCodeVerifier();
  const challenge = createCodeChallenge(verifier);
  const state = randomBytes(16).toString("hex");
  const nonce = randomBytes(16).toString("hex");
  const redirectUri = `http://${XAI_OAUTH_REDIRECT_HOST}:${XAI_OAUTH_REDIRECT_PORT}${XAI_OAUTH_REDIRECT_PATH}`;
  const server = await startCallbackServer(state);
  const authorizeUrl = buildAuthorizeUrl({
    authorizationEndpoint: discovery.authorization_endpoint,
    redirectUri,
    codeChallenge: challenge,
    state,
    nonce,
  });

  callbacks.onAuth({
    url: authorizeUrl,
    instructions: `Complete the xAI authorization. Waiting for callback on ${redirectUri}`,
  });

  try {
    let code = null;
    if (callbacks.onManualCodeInput) {
      let manualInput;
      let manualError;
      const manualPromise = callbacks.onManualCodeInput()
        .then((input) => {
          manualInput = input;
          server.cancelWait();
        })
        .catch((err) => {
          manualError = err instanceof Error ? err : new Error(String(err));
          server.cancelWait();
        });
      const callback = await server.waitForCode();
      if (manualError) throw manualError;
      if (callback?.code) code = callback.code;
      if (!code && manualInput) code = parseAuthorizationInput(manualInput, state).code;
      if (!code) {
        await manualPromise;
        if (manualError) throw manualError;
        if (manualInput) code = parseAuthorizationInput(manualInput, state).code;
      }
    } else {
      const callback = await server.waitForCode();
      if (callback?.code) code = callback.code;
    }

    if (!code) {
      const input = await callbacks.onPrompt({ message: "Paste the xAI redirect URL or authorization code" });
      code = parseAuthorizationInput(input, state).code;
    }
    if (!code) throw new Error("Missing xAI authorization code");

    const token = await exchangeAuthorizationCode({
      tokenEndpoint: discovery.token_endpoint,
      code,
      verifier,
      redirectUri,
    });
    return normalizeTokenCredentials(token, {
      tokenEndpoint: discovery.token_endpoint,
      redirectUri,
    });
  } finally {
    server.close();
  }
}

async function discoverXaiOAuth(fetchImpl = fetch) {
  const response = await fetchImpl(XAI_OAUTH_DISCOVERY_URL, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`xAI OIDC discovery failed (${response.status})`);
  const data = await response.json();
  const authorizationEndpoint = String(data.authorization_endpoint || "").trim();
  const tokenEndpoint = String(data.token_endpoint || "").trim();
  if (!authorizationEndpoint || !tokenEndpoint) throw new Error("xAI OIDC discovery missing endpoints");
  validateXaiAuthEndpoint(authorizationEndpoint, "authorization_endpoint");
  validateXaiAuthEndpoint(tokenEndpoint, "token_endpoint");
  return { authorization_endpoint: authorizationEndpoint, token_endpoint: tokenEndpoint };
}

function buildAuthorizeUrl({ authorizationEndpoint, redirectUri, codeChallenge, state, nonce }) {
  const url = new URL(authorizationEndpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", XAI_OAUTH_CLIENT_ID);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", XAI_OAUTH_SCOPE);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", state);
  url.searchParams.set("nonce", nonce);
  url.searchParams.set("plan", "generic");
  url.searchParams.set("referrer", "hermes-agent");
  return url.toString();
}

async function exchangeAuthorizationCode({ tokenEndpoint, code, verifier, redirectUri, fetchImpl = fetch }) {
  validateXaiAuthEndpoint(tokenEndpoint, "token_endpoint");
  const response = await fetchImpl(tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: XAI_OAUTH_CLIENT_ID,
      code_verifier: verifier,
    }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`xAI token exchange failed (${response.status}): ${text || response.statusText}`);
  }
  return response.json();
}

export async function refreshSuperGrokToken(credentials, { fetchImpl = fetch } = {}) {
  const refreshToken = credentials.refresh || credentials.refresh_token;
  if (!refreshToken) throw new Error("SuperGrok OAuth is missing a refresh token");
  const tokenEndpoint = String(credentials.tokenEndpoint || "").trim() || (await discoverXaiOAuth(fetchImpl)).token_endpoint;
  validateXaiAuthEndpoint(tokenEndpoint, "token_endpoint");
  const response = await fetchImpl(tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: XAI_OAUTH_CLIENT_ID,
      refresh_token: refreshToken,
    }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`xAI token refresh failed (${response.status}): ${text || response.statusText}`);
  }
  const token = await response.json();
  return normalizeTokenCredentials(token, {
    tokenEndpoint,
    redirectUri: credentials.redirectUri,
    previousRefresh: refreshToken,
  });
}

function normalizeTokenCredentials(token, { tokenEndpoint, redirectUri, previousRefresh = "" } = {}) {
  const access = String(token.access_token || token.access || "").trim();
  const refresh = String(token.refresh_token || token.refresh || previousRefresh || "").trim();
  if (!access) throw new Error("xAI token response missing access_token");
  if (!refresh) throw new Error("xAI token response missing refresh_token");
  const expiresIn = Number(token.expires_in || 3600);
  return {
    access,
    refresh,
    expires: Date.now() + Math.max(60, expiresIn) * 1000,
    idToken: String(token.id_token || token.idToken || ""),
    tokenType: String(token.token_type || token.tokenType || "Bearer"),
    tokenEndpoint,
    redirectUri,
    baseUrl: XAI_BASE_URL,
  };
}

function startCallbackServer(expectedState) {
  let settle;
  const waitForCodePromise = new Promise((resolve) => {
    settle = resolve;
  });
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || "/", `http://${XAI_OAUTH_REDIRECT_HOST}:${XAI_OAUTH_REDIRECT_PORT}`);
    if (url.pathname !== XAI_OAUTH_REDIRECT_PATH) {
      res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
      res.end("Callback route not found.");
      return;
    }
    if (url.searchParams.get("state") !== expectedState) {
      res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
      res.end("State mismatch.");
      settle(null);
      return;
    }
    const code = url.searchParams.get("code");
    const error = url.searchParams.get("error");
    if (!code && error) {
      res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`xAI authorization failed: ${error}`);
      settle(null);
      return;
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end("SuperGrok authentication completed. You can close this window.");
    settle({ code });
  });
  return new Promise((resolve) => {
    server.listen(XAI_OAUTH_REDIRECT_PORT, XAI_OAUTH_REDIRECT_HOST, () => {
      resolve({
        close: () => server.close(),
        cancelWait: () => settle(null),
        waitForCode: () => waitForCodePromise,
      });
    }).on("error", () => {
      settle(null);
      resolve({ close: () => {}, cancelWait: () => settle(null), waitForCode: () => waitForCodePromise });
    });
  });
}

function parseAuthorizationInput(input, expectedState) {
  const value = String(input || "").trim();
  if (!value) return {};
  try {
    const url = new URL(value);
    const state = url.searchParams.get("state") || undefined;
    if (state && state !== expectedState) throw new Error("State mismatch");
    return { code: url.searchParams.get("code") || undefined };
  } catch (err) {
    if (err.message === "State mismatch") throw err;
  }
  if (value.includes("code=")) {
    const params = new URLSearchParams(value);
    const state = params.get("state") || undefined;
    if (state && state !== expectedState) throw new Error("State mismatch");
    return { code: params.get("code") || undefined };
  }
  return { code: value };
}

function createCodeVerifier() {
  return base64Url(randomBytes(32));
}

function createCodeChallenge(verifier) {
  return base64Url(createHash("sha256").update(verifier).digest());
}

function base64Url(buffer) {
  return Buffer.from(buffer).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function validateXaiAuthEndpoint(value, field) {
  const url = new URL(value);
  if (url.protocol !== "https:" || !url.hostname.endsWith("x.ai")) {
    throw new Error(`Invalid xAI OAuth ${field}: ${value}`);
  }
}
