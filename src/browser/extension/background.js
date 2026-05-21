const DAEMON_WS = "ws://127.0.0.1:4328/extension";
let socket = null;
let reconnectTimer = null;

startBridge();
chrome.runtime.onStartup.addListener(startBridge);
chrome.runtime.onInstalled.addListener(startBridge);
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "march-browser-reconnect") connect();
});

function startBridge() {
  connect();
  chrome.alarms.create("march-browser-reconnect", { periodInMinutes: 0.5 });
}

function connect() {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;
  socket = new WebSocket(DAEMON_WS);
  socket.onopen = () => setBadge("on");
  socket.onmessage = (event) => handleMessage(event.data);
  socket.onclose = scheduleReconnect;
  socket.onerror = () => socket?.close();
}

function scheduleReconnect() {
  setBadge("off");
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, 1000);
}

async function handleMessage(data) {
  const request = JSON.parse(data);
  try {
    const result = await dispatch(request.method, request.params ?? {});
    send({ id: request.id, ok: true, result });
  } catch (err) {
    send({ id: request.id, ok: false, error: err.message });
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
  if (action === "new") return { tab: formatTab(await chrome.tabs.create({ url: params.url, active: params.active ?? true })) };
  if (!tabId) throw new Error(`${action} requires tabId`);
  if (action === "navigate") return { tab: formatTab(await chrome.tabs.update(tabId, { url: requiredUrl(params.url), active: params.active })) };
  if (action === "focus") return { tab: formatTab(await chrome.tabs.update(tabId, { active: true })) };
  if (action === "close") { await chrome.tabs.remove(tabId); return { closed: String(tabId) }; }
  if (action === "reload") { await chrome.tabs.reload(tabId); return { reloaded: String(tabId) }; }
  if (action === "back" || action === "forward") return await navHistory(tabId, action);
  throw new Error(`Unknown open action: ${action}`);
}

async function navHistory(tabId, action) {
  const code = action === "back" ? "history.back(); return true;" : "history.forward(); return true;";
  await executeInTab(tabId, executeUserCode, [code, false]);
  return { tabId: String(tabId), action };
}

async function readTab(params) {
  const tabId = parseTabId(params.tabId);
  if (!tabId) throw new Error("read requires tabId");
  const include = params.include ?? { text: true, elements: true };
  const page = await firstInjectionResult(tabId, collectPage, [include]);
  const tab = await chrome.tabs.get(tabId);
  return { tab: formatTab(tab), page };
}

async function runScript(params) {
  const tabId = parseTabId(params.tabId);
  if (!tabId) throw new Error("script requires tabId");
  const result = await firstInjectionResult(tabId, executeUserCode, [params.code, params.awaitPromise ?? true]);
  return { tabId: String(tabId), result };
}

async function firstInjectionResult(tabId, func, args) {
  const [injection] = await chrome.scripting.executeScript({ target: { tabId }, func, args });
  if (!injection) throw new Error(`No script injection result for tab ${tabId}`);
  const result = injection.result;
  if (result && result.__marchError) throw new Error(result.__marchError);
  return result;
}

function executeUserCode(code, awaitPromise) {
  try {
    const value = new Function(code)();
    if (!awaitPromise || !value || typeof value.then !== "function") return value;
    return value.catch((err) => ({ __marchError: err?.stack || err?.message || String(err) }));
  } catch (err) {
    return { __marchError: err?.stack || err?.message || String(err) };
  }
}

function collectPage(include) {
  try {
    const result = { title: document.title, url: location.href };
    if (include.text !== false) result.text = document.body?.innerText ?? "";
    if (include.html) result.html = document.documentElement?.outerHTML ?? "";
    if (include.elements !== false) result.elements = collectPageElements();
    return result;
  } catch (err) {
    return { __marchError: err?.stack || err?.message || String(err) };
  }

  function collectPageElements() {
    const selector = "a,button,input,textarea,select,[role=button],[role=link],[contenteditable=true]";
    return [...document.querySelectorAll(selector)].slice(0, 300).map((el, index) => ({
      index,
      tag: el.tagName.toLowerCase(),
      type: el.getAttribute("type") || undefined,
      role: el.getAttribute("role") || undefined,
      text: (el.innerText || el.value || el.getAttribute("aria-label") || "").trim().slice(0, 200),
      placeholder: el.getAttribute("placeholder") || undefined,
      href: el.href || undefined,
      selector: stableSelector(el),
    }));
  }

  function stableSelector(el) {
    if (el.id) return `#${CSS.escape(el.id)}`;
    const name = el.getAttribute("name");
    if (name) return `${el.tagName.toLowerCase()}[name="${CSS.escape(name)}"]`;
    const parts = [];
    for (let node = el; node && node.nodeType === Node.ELEMENT_NODE && parts.length < 4; node = node.parentElement) {
      const tag = node.tagName.toLowerCase();
      const same = [...(node.parentElement?.children ?? [])].filter((child) => child.tagName === node.tagName);
      parts.unshift(same.length > 1 ? `${tag}:nth-of-type(${same.indexOf(node) + 1})` : tag);
    }
    return parts.join(" > ");
  }
}

function formatTab(tab) {
  return {
    id: String(tab.id),
    windowId: tab.windowId,
    active: tab.active,
    title: tab.title,
    url: tab.url,
    status: tab.status,
  };
}

function parseTabId(value) {
  const id = Number(value);
  return Number.isFinite(id) ? id : null;
}

function requiredUrl(url) {
  if (!url) throw new Error("url is required");
  return url;
}
