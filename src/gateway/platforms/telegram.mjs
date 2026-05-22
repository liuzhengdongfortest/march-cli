import { readFileSync } from "node:fs";

const TELEGRAM_API_BASE = "https://api.telegram.org";
const MAX_TELEGRAM_TEXT = 3900;

export function createTelegramPlatformAdapter({
  config = {},
  fetchImpl = globalThis.fetch,
  env = process.env,
  sleep = defaultSleep,
  logger = console,
} = {}) {
  return new TelegramPlatformAdapter({ config, fetchImpl, env, sleep, logger });
}

export class TelegramPlatformAdapter {
  #config;
  #fetch;
  #env;
  #sleep;
  #logger;
  #offset = 0;
  #running = false;

  constructor({ config, fetchImpl, env, sleep, logger }) {
    this.id = "telegram";
    this.#config = config ?? {};
    this.#fetch = fetchImpl;
    this.#env = env ?? {};
    this.#sleep = sleep;
    this.#logger = logger;
  }

  get configured() {
    return Boolean(this.#token());
  }

  async start({ handleMessage, signal } = {}) {
    if (typeof handleMessage !== "function") throw new Error("Telegram gateway requires a message handler");
    this.#assertReady();
    this.#running = true;
    await this.#api("deleteWebhook", { drop_pending_updates: false });
    this.#logger.info?.("[gateway:telegram] polling started");
    while (this.#running && !signal?.aborted) {
      try {
        await this.pollOnce({ handleMessage });
      } catch (err) {
        this.#logger.warn?.(`[gateway:telegram] polling error: ${err.message}`);
        await this.#sleep(this.#retryDelayMs());
      }
    }
  }

  stop() {
    this.#running = false;
  }

  async pollOnce({ handleMessage } = {}) {
    if (typeof handleMessage !== "function") throw new Error("Telegram gateway requires a message handler");
    this.#assertReady();
    const response = await this.#api("getUpdates", {
      offset: this.#offset || undefined,
      timeout: this.#pollTimeoutSeconds(),
      allowed_updates: ["message"],
    });
    const updates = Array.isArray(response.result) ? response.result : [];
    for (const update of updates) {
      if (Number.isInteger(update.update_id)) this.#offset = Math.max(this.#offset, update.update_id + 1);
      const message = normalizeTelegramUpdate(update, { allowedUsers: this.#allowedUsers(), dmOnly: this.#dmOnly() });
      if (!message) continue;
      const result = await handleMessage(message);
      await this.send({ chatId: message.chatId, lines: result?.lines ?? [], replyToMessageId: message.messageId });
    }
    return updates.length;
  }

  async send({ chatId, lines, replyToMessageId = null }) {
    const chunks = splitTelegramLines(lines);
    for (const text of chunks) {
      await this.#api("sendMessage", {
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
        ...replyOptions(replyToMessageId),
      });
    }
  }

  async sendBinary({ chatId, binary, replyToMessageId = null }) {
    const method = telegramBinaryMethod(binary?.type);
    const field = telegramBinaryField(binary?.type);
    const payload = {
      chat_id: chatId,
      ...replyOptions(replyToMessageId),
      ...(binary.caption ? { caption: binary.caption } : {}),
    };
    if (binary.url) {
      await this.#api(method, { ...payload, [field]: binary.url });
      return { target: "telegram", method, source: "url" };
    }
    if (!binary.path) throw new Error("Telegram binary send requires path or url");
    const form = new FormData();
    for (const [key, value] of Object.entries(payload)) form.append(key, String(value));
    const data = readFileSync(binary.path);
    const blob = new Blob([data], { type: binary.mimeType || "application/octet-stream" });
    form.append(field, blob, binary.filename || binary.path.split(/[\\/]/).at(-1) || "media.bin");
    await this.#apiForm(method, form);
    return { target: "telegram", method, source: "path" };
  }

  #assertReady() {
    if (!this.#token()) throw new Error("Telegram gateway requires a bot token. Set TELEGRAM_BOT_TOKEN or gateway.platforms.telegram.botTokenEnv.");
    if (typeof this.#fetch !== "function") throw new Error("Telegram gateway requires fetch support");
  }

  async #api(method, payload) {
    return this.#apiRequest(method, {
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload ?? {}),
    });
  }

  async #apiForm(method, form) {
    return this.#apiRequest(method, { body: form });
  }

  async #apiRequest(method, init) {
    const response = await this.#fetch(`${this.#apiBase()}/bot${this.#token()}/${method}`, {
      method: "POST",
      ...init,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || data?.ok !== true) {
      const description = data?.description || response.statusText || `HTTP ${response.status}`;
      throw new Error(`Telegram ${method} failed: ${description}`);
    }
    return data;
  }

  #token() {
    const tokenEnv = this.#config.botTokenEnv ?? this.#config.bot_token_env ?? this.#config.tokenEnv ?? "TELEGRAM_BOT_TOKEN";
    return cleanString(this.#config.botToken ?? this.#config.bot_token ?? this.#config.token ?? this.#env[tokenEnv]);
  }

  #allowedUsers() {
    const raw = this.#config.allowedUsers ?? this.#config.allowed_users ?? this.#env.MARCH_TELEGRAM_ALLOWED_USERS ?? this.#env.TELEGRAM_ALLOWED_USERS ?? "";
    if (Array.isArray(raw)) return new Set(raw.map((value) => String(value).trim()).filter(Boolean));
    return new Set(String(raw).split(",").map((value) => value.trim()).filter(Boolean));
  }

  #dmOnly() {
    return this.#config.dmOnly ?? this.#config.dm_only ?? true;
  }

  #apiBase() {
    return cleanString(this.#config.apiBase ?? this.#config.api_base) ?? TELEGRAM_API_BASE;
  }

  #pollTimeoutSeconds() {
    return positiveInteger(this.#config.pollTimeoutSeconds ?? this.#config.poll_timeout_seconds, 30);
  }

  #retryDelayMs() {
    return positiveInteger(this.#config.retryDelayMs ?? this.#config.retry_delay_ms, 2000);
  }
}

export function normalizeTelegramUpdate(update, { allowedUsers = new Set(), dmOnly = true } = {}) {
  const rawMessage = update?.message;
  const text = typeof rawMessage?.text === "string" ? rawMessage.text.trim() : "";
  if (!rawMessage || !text) return null;

  const userId = cleanString(rawMessage.from?.id);
  const chatId = cleanString(rawMessage.chat?.id);
  if (!userId || !chatId) return null;
  if (!isAllowedTelegramUser(userId, allowedUsers)) return null;
  if (dmOnly && rawMessage.chat?.type !== "private") return null;

  return {
    platform: "telegram",
    chatId,
    userId,
    messageId: cleanString(rawMessage.message_id),
    text,
    receivedAt: rawMessage.date ? new Date(rawMessage.date * 1000).toISOString() : new Date().toISOString(),
  };
}

export function isAllowedTelegramUser(userId, allowedUsers) {
  if (!(allowedUsers instanceof Set) || allowedUsers.size === 0) return false;
  return allowedUsers.has("*") || allowedUsers.has(String(userId));
}

export function telegramBinaryMethod(type) {
  if (type === "image") return "sendPhoto";
  if (type === "video") return "sendVideo";
  if (type === "audio") return "sendAudio";
  if (type === "file") return "sendDocument";
  throw new Error(`Unsupported Telegram binary type: ${type}`);
}

export function telegramBinaryField(type) {
  if (type === "image") return "photo";
  if (type === "video") return "video";
  if (type === "audio") return "audio";
  if (type === "file") return "document";
  throw new Error(`Unsupported Telegram binary type: ${type}`);
}

export function splitTelegramLines(lines) {
  const text = (Array.isArray(lines) ? lines : [lines])
    .map((line) => String(line ?? "").trimEnd())
    .filter(Boolean)
    .join("\n");
  if (!text) return [];

  const chunks = [];
  for (let index = 0; index < text.length; index += MAX_TELEGRAM_TEXT) {
    chunks.push(text.slice(index, index + MAX_TELEGRAM_TEXT));
  }
  return chunks;
}

function replyOptions(replyToMessageId) {
  return replyToMessageId ? { reply_to_message_id: Number(replyToMessageId), allow_sending_without_reply: true } : {};
}

function cleanString(value) {
  if (value == null) return null;
  const clean = String(value).trim();
  return clean || null;
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
