import { buildExecCode } from "./execute-code.js";
import { serializeError } from "./errors.js";
import { BROWSER_COLLECTION_ITEM_LIMIT, BROWSER_OUTPUT_CHAR_LIMIT } from "./output-limits.js";

const DAEMON_WS = "ws://127.0.0.1:4328/extension";
let socket = null;
let reconnectTimer = null;
let connecting = false;

startBridge();
chrome.runtime.onStartup.addListener(startBridge);
chrome.runtime.onInstalled.addListener(startBridge);
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "march-browser-reconnect") connect();
  if (alarm.name === "march-browser-keepalive") keepAlive();
});

function startBridge() {
  connect();
  chrome.alarms.create("march-browser-reconnect", { periodInMinutes: 0.5 });
}

function connect() {
  if (connecting || socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) return;
  connecting = true;
  try {
    socket = new WebSocket(DAEMON_WS);
  } catch {
    connecting = false;
    scheduleReconnect();
    return;
  }
  socket.onopen = () => {
    connecting = false;
    setBadge("on");
    scheduleKeepAlive();
  };
  socket.onmessage = (event) => handleMessage(event.data);
  socket.onclose = scheduleReconnect;
  socket.onerror = () => socket?.close();
}

function keepAlive() {
  if (socket?.readyState === WebSocket.OPEN) {
    send({ type: "ping" });
    scheduleKeepAlive();
  } else {
    scheduleReconnect();
  }
}

function scheduleKeepAlive() {
  chrome.alarms.create("march-browser-keepalive", { delayInMinutes: 0.4 });
}

function scheduleReconnect() {
  connecting = false;
  setBadge("off");
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, 1000);
}

async function handleMessage(data) {
  const request = JSON.parse(data);
  if (!request.id) return;
  try {
    const result = await dispatch(request.method, request.params ?? {});
    send({ id: request.id, ok: true, result });
  } catch (err) {
    send({ id: request.id, ok: false, error: serializeError(err) });
  }
}

function send(payload) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
}

function setBadge(state) {
  chrome.action.setBadgeText({ text: state === "on" ? "ON" : "" });
  chrome.action.setBadgeBackgroundColor({ color: "#16a34a" });
}

async function dispatch(method, params) {
  if (method === "tabs") return { tabs: (await chrome.tabs.query({})).map(formatTab) };
  if (method === "open") return await openTab(params);
  if (method === "read") return await readTab(params);
  if (method === "script") return await runScript(params);
  throw new Error(`Unknown browser method: ${method}`);
}

async function openTab(params) {
  const action = params.action;
  const tabId = parseTabId(params.tabId);
  if (action === "new") return { tab: formatTab(await chrome.tabs.create({ url: requiredUrl(params.url), active: params.active ?? true })) };
  if (!tabId) throw new Error(`${action} requires tabId`);
  if (action === "navigate") return { tab: formatTab(await chrome.tabs.update(tabId, { url: requiredUrl(params.url), active: params.active })) };
  if (action === "focus") return await focusTab(tabId);
  if (action === "close") { await chrome.tabs.remove(tabId); return { closed: String(tabId) }; }
  if (action === "reload") { await chrome.tabs.reload(tabId); return { reloaded: String(tabId) }; }
  if (action === "back" || action === "forward") return await navHistory(tabId, action);
  throw new Error(`Unknown open action: ${action}`);
}

async function focusTab(tabId) {
  const tab = await chrome.tabs.update(tabId, { active: true });
  if (tab.windowId) await chrome.windows.update(tab.windowId, { focused: true });
  return { tab: formatTab(tab) };
}

async function navHistory(tabId, action) {
  await executePageCode(tabId, action === "back" ? "history.back(); true" : "history.forward(); true");
  return { tabId: String(tabId), action };
}

async function readTab(params) {
  const tabId = requireTabId(params.tabId, "read");
  const include = params.include ?? { text: true, elements: true };
  const page = await executePageCode(tabId, buildReadCode(include));
  const tab = await chrome.tabs.get(tabId);
  return { tab: formatTab(tab), page };
}

async function runScript(params) {
  const tabId = requireTabId(params.tabId, "script");
  const result = await executePageCode(tabId, String(params.code ?? ""));
  return { tabId: String(tabId), result };
}

async function executePageCode(tabId, code) {
  const wrapped = buildExecCode(code);
  const injected = await executeViaScripting(tabId, wrapped).catch((err) => ({ ok: false, csp: true, error: serializeError(err) }));
  if (injected?.ok) return injected.data;
  if (!injected?.csp) throwErrorResult(injected);
  const cdp = await executeViaCdp(tabId, wrapped).catch((err) => ({ ok: false, error: serializeError(err) }));
  if (cdp?.ok) return cdp.data;
  throwErrorResult(cdp);
}

async function executeViaScripting(tabId, source) {
  const [injection] = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: (script) => eval(script),
    args: [source],
  });
  if (!injection) return { ok: false, error: { message: `No script injection result for tab ${tabId}` } };
  if (injection.result == null) return { ok: false, csp: true, error: { message: "Script returned no value" } };
  return injection.result;
}

async function executeViaCdp(tabId, expression) {
  const target = { tabId };
  let attached = false;
  try {
    await chrome.debugger.attach(target, "1.3");
    attached = true;
    const response = await chrome.debugger.sendCommand(target, "Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (response.exceptionDetails) {
      return { ok: false, error: { message: response.exceptionDetails.exception?.description || "CDP Runtime.evaluate failed" } };
    }
    return response.result?.value ?? { ok: true, data: undefined };
  } finally {
    if (attached) await chrome.debugger.detach(target).catch(() => {});
  }
}

function buildReadCode(include) {
  return `return (() => {
    const include = ${JSON.stringify(include)};
    const OUTPUT_CHAR_LIMIT = ${BROWSER_OUTPUT_CHAR_LIMIT};
    const COLLECTION_ITEM_LIMIT = ${BROWSER_COLLECTION_ITEM_LIMIT};
    const FIELD_CHAR_LIMIT = 500;
    const page = { title: truncateText(document.title, FIELD_CHAR_LIMIT), url: location.href };
    if (include.text !== false) page.text = truncateText(document.body?.innerText || "");
    if (include.html) page.html = truncateText(document.documentElement?.outerHTML || "");
    if (include.elements !== false) page.elements = Array.from(document.querySelectorAll("a,button,input,textarea,select,[role=button],[role=link],[contenteditable=true]")).slice(0, COLLECTION_ITEM_LIMIT).map((el, index) => {
      const tag = el.tagName.toLowerCase();
      const text = truncateText((el.innerText || el.value || el.getAttribute("aria-label") || "").trim(), 200);
      return {
        index,
        tag,
        type: truncateText(el.getAttribute("type") || "", FIELD_CHAR_LIMIT) || undefined,
        role: truncateText(el.getAttribute("role") || "", FIELD_CHAR_LIMIT) || undefined,
        text,
        placeholder: truncateText(el.getAttribute("placeholder") || "", FIELD_CHAR_LIMIT) || undefined,
        href: truncateText(el.href || "", FIELD_CHAR_LIMIT) || undefined,
        selector: truncateText(selectorFor(el), FIELD_CHAR_LIMIT),
      };
    });
    return page;
    function truncateText(value, limit = OUTPUT_CHAR_LIMIT) {
      const text = String(value ?? "");
      if (text.length <= limit) return text;
      const marker = "\\n[truncated browser output: " + text.length + " chars -> " + limit + " chars]";
      return text.slice(0, Math.max(0, limit - marker.length)) + marker;
    }
    function selectorFor(el) {
      if (el.id) return "#" + CSS.escape(el.id);
      const name = el.getAttribute("name");
      if (name) return tagName(el) + "[name=\\\"" + CSS.escape(name) + "\\\"]";
      const parts = [];
      for (let node = el; node && node.nodeType === Node.ELEMENT_NODE && parts.length < 4; node = node.parentElement) {
        const tag = tagName(node);
        const siblings = Array.from(node.parentElement?.children || []).filter((child) => child.tagName === node.tagName);
        parts.unshift(siblings.length > 1 ? tag + ":nth-of-type(" + (siblings.indexOf(node) + 1) + ")" : tag);
      }
      return parts.join(" > ");
    }
    function tagName(el) { return el.tagName.toLowerCase(); }
  })()`;
}

function throwErrorResult(result) {
  const error = result?.error;
  if (typeof error === "string") throw new Error(error);
  throw new Error(error?.stack || error?.message || "Browser script failed");
}

function formatTab(tab) {
  return { id: String(tab.id), windowId: tab.windowId, active: tab.active, title: tab.title, url: tab.url, status: tab.status };
}

function requireTabId(value, action) {
  const tabId = parseTabId(value);
  if (!tabId) throw new Error(`${action} requires tabId`);
  return tabId;
}

function parseTabId(value) {
  const id = Number(value);
  return Number.isFinite(id) ? id : null;
}

function requiredUrl(url) {
  if (!url) throw new Error("url is required");
  return url;
}
