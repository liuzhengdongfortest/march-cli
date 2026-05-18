import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import tls from "node:tls";
import { EnvHttpProxyAgent, setGlobalDispatcher } from "undici";

export function installNetworkEnvironment(network = {}) {
  const proxy = resolveProxySettings(network);
  installProxyDispatcher(proxy);
  const ca = installDefaultCertificates(network.ca ?? "system");
  return { proxy, ca };
}

export function resolveProxySettings(network = {}, { env = process.env, platform = process.platform } = {}) {
  const proxyMode = network.proxy ?? "system";
  const explicitNoProxy = formatNoProxy(network.noProxy);

  if (proxyMode === false || proxyMode === "none" || proxyMode === "direct") {
    return { mode: "direct", httpProxy: null, httpsProxy: null, noProxy: explicitNoProxy ?? env.NO_PROXY ?? env.no_proxy ?? null };
  }

  if (typeof proxyMode === "string" && proxyMode.trim() && proxyMode !== "system") {
    const proxy = normalizeProxyUrl(proxyMode.trim());
    return { mode: "config", httpProxy: proxy, httpsProxy: proxy, noProxy: explicitNoProxy ?? env.NO_PROXY ?? env.no_proxy ?? null };
  }

  const envProxy = proxyFromEnv(env, explicitNoProxy);
  if (envProxy.httpProxy || envProxy.httpsProxy) return { mode: "env", ...envProxy };

  const systemProxy = platform === "win32" ? detectWindowsProxy() : null;
  if (systemProxy?.httpProxy || systemProxy?.httpsProxy) {
    return {
      mode: "system",
      httpProxy: systemProxy.httpProxy,
      httpsProxy: systemProxy.httpsProxy,
      noProxy: explicitNoProxy ?? systemProxy.noProxy ?? null,
    };
  }

  return { mode: "direct", httpProxy: null, httpsProxy: null, noProxy: explicitNoProxy ?? null };
}

function installProxyDispatcher(proxy) {
  setGlobalDispatcher(new EnvHttpProxyAgent({
    httpProxy: proxy.httpProxy ?? "",
    httpsProxy: proxy.httpsProxy ?? "",
    noProxy: proxy.noProxy ?? "",
    bodyTimeout: 0,
    headersTimeout: 0,
  }));
}

export function installDefaultCertificates(caConfig = "system") {
  const entries = Array.isArray(caConfig) ? caConfig : [caConfig];
  const wantsSystem = entries.includes("system");
  const pemPaths = entries.filter((entry) => typeof entry === "string" && entry && entry !== "system");

  if (!wantsSystem && pemPaths.length === 0) return { mode: "default", system: false, extraFiles: [] };
  if (typeof tls.setDefaultCACertificates !== "function" || typeof tls.getCACertificates !== "function") {
    return { mode: "unsupported", system: false, extraFiles: [] };
  }

  const certificates = [
    ...tls.getCACertificates("default"),
    ...(wantsSystem ? tls.getCACertificates("system") : []),
    ...pemPaths.map((path) => readFileSync(path, "utf8")),
  ];
  tls.setDefaultCACertificates([...new Set(certificates)]);
  return { mode: "installed", system: wantsSystem, extraFiles: pemPaths };
}

function proxyFromEnv(env, explicitNoProxy) {
  const httpsProxy = env.HTTPS_PROXY ?? env.https_proxy ?? env.ALL_PROXY ?? env.all_proxy ?? null;
  const httpProxy = env.HTTP_PROXY ?? env.http_proxy ?? env.ALL_PROXY ?? env.all_proxy ?? null;
  const normalizedHttp = httpProxy ? normalizeProxyUrl(httpProxy) : null;
  return {
    httpProxy: normalizedHttp,
    httpsProxy: httpsProxy ? normalizeProxyUrl(httpsProxy) : normalizedHttp,
    noProxy: explicitNoProxy ?? env.NO_PROXY ?? env.no_proxy ?? null,
  };
}

function detectWindowsProxy() {
  try {
    const output = execFileSync("reg", ["query", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings"], { encoding: "utf8", windowsHide: true });
    const values = parseRegQuery(output);
    if (values.ProxyEnable !== "0x1") return null;
    return parseWindowsProxyServer(values.ProxyServer, values.ProxyOverride);
  } catch {
    return null;
  }
}

function parseRegQuery(output) {
  const values = {};
  for (const line of output.split(/\r?\n/)) {
    const match = line.trim().match(/^(\S+)\s+REG_\S+\s+(.+)$/);
    if (match) values[match[1]] = match[2].trim();
  }
  return values;
}

function parseWindowsProxyServer(proxyServer, proxyOverride) {
  if (!proxyServer) return null;
  const entries = Object.fromEntries(proxyServer.split(";").map((part) => part.split("=")).filter((part) => part.length === 2));
  const fallback = proxyServer.includes("=") ? null : proxyServer;
  return {
    httpProxy: normalizeProxyUrl(entries.http ?? fallback),
    httpsProxy: normalizeProxyUrl(entries.https ?? entries.http ?? fallback),
    noProxy: formatWindowsProxyOverride(proxyOverride),
  };
}

function normalizeProxyUrl(value) {
  if (!value) return null;
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `http://${value}`;
}

function formatNoProxy(value) {
  if (Array.isArray(value)) return value.join(",");
  if (typeof value === "string") return value;
  return null;
}

function formatWindowsProxyOverride(value) {
  if (!value) return null;
  return value
    .split(";")
    .map((entry) => entry.trim())
    .filter((entry) => entry && entry !== "<local>")
    .join(",") || null;
}
