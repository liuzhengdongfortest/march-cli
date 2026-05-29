import {
  BROWSER_COLLECTION_ITEM_LIMIT,
  BROWSER_OBJECT_KEY_LIMIT,
  BROWSER_OUTPUT_CHAR_LIMIT,
  BROWSER_SERIALIZE_DEPTH_LIMIT,
} from "./output-limits.js";

export function buildExecCode(code) {
  return `(async () => {
    const OUTPUT_CHAR_LIMIT = ${BROWSER_OUTPUT_CHAR_LIMIT};
    const COLLECTION_ITEM_LIMIT = ${BROWSER_COLLECTION_ITEM_LIMIT};
    const OBJECT_KEY_LIMIT = ${BROWSER_OBJECT_KEY_LIMIT};
    const SERIALIZE_DEPTH_LIMIT = ${BROWSER_SERIALIZE_DEPTH_LIMIT};

    function truncateText(value, limit = OUTPUT_CHAR_LIMIT, budget = null) {
      const text = String(value ?? "");
      const allowed = budget ? Math.max(0, Math.min(limit, budget.remaining)) : limit;
      if (allowed <= 0) return "[truncated browser output: result budget exhausted]";
      let output = text;
      if (text.length > allowed) {
        const marker = "\\n[truncated browser output: " + text.length + " chars -> " + allowed + " chars]";
        output = text.slice(0, Math.max(0, allowed - marker.length)) + marker.slice(0, allowed);
      }
      if (budget) budget.remaining = Math.max(0, budget.remaining - output.length);
      return output;
    }

    function smartResult(value) {
      return safeValue(value, 0, new WeakSet(), { remaining: OUTPUT_CHAR_LIMIT });
    }

    function safeValue(value, depth, seen, budget) {
      if (typeof value === "string") return truncateText(value, OUTPUT_CHAR_LIMIT, budget);
      if (value == null || typeof value !== "object") return value;
      if (depth >= SERIALIZE_DEPTH_LIMIT) return "[truncated browser output: max object depth reached]";
      if (seen.has(value)) return "[Circular]";
      seen.add(value);
      try {
        try { if (value.window === value && value.document) return "[Window: " + (value.location?.href || "about:blank") + "]"; } catch {}
        if (typeof Node !== "undefined" && value.nodeType === Node.ELEMENT_NODE) return truncateText(value.outerHTML, OUTPUT_CHAR_LIMIT, budget);
        if (typeof NodeList !== "undefined" && (value instanceof NodeList || value instanceof HTMLCollection)) {
          return Array.from(value).slice(0, COLLECTION_ITEM_LIMIT).map((item) => safeValue(item, depth + 1, seen, budget));
        }
        if (Array.isArray(value)) {
          const items = value.slice(0, COLLECTION_ITEM_LIMIT).map((item) => safeValue(item, depth + 1, seen, budget));
          if (value.length > COLLECTION_ITEM_LIMIT) items.push("[truncated browser output: " + value.length + " items -> " + COLLECTION_ITEM_LIMIT + " items]");
          return items;
        }
        try {
          const output = {};
          const keys = Object.keys(value);
          for (const key of keys.slice(0, OBJECT_KEY_LIMIT)) output[truncateText(key, 200, budget)] = safeValue(value[key], depth + 1, seen, budget);
          if (keys.length > OBJECT_KEY_LIMIT) output.__truncatedKeys = keys.length - OBJECT_KEY_LIMIT;
          return output;
        } catch (err) {
          return "[Unserializable: " + (err?.message || String(err)) + "]";
        }
      } finally {
        seen.delete(value);
      }
    }
    function executable(source) {
      const lines = source.split(/\\r?\\n/);
      let index = lines.length - 1;
      while (index >= 0 && !lines[index].trim()) index--;
      if (index < 0) return source;
      const last = lines[index].trim();
      if (/^(return\\b|let\\b|const\\b|var\\b|if\\b|for\\b|while\\b|switch\\b|try\\b|throw\\b|class\\b|function\\b|async\\b|import\\b|export\\b|\\/\\/|})/.test(last)) return source;
      lines[index] = lines[index].match(/^(\\s*)/)[1] + "return " + last;
      return lines.join("\\n");
    }
    try {
      const source = ${JSON.stringify(code)}.trim();
      const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
      let value;
      if (/^return\\b/.test(source) || /\\n\\s*return\\b/.test(source)) {
        value = await (new AsyncFunction(source))();
      } else {
        try {
          value = eval(source);
          if (value && typeof value.then === "function") value = await value;
        } catch (err) {
          if (err instanceof SyntaxError) value = await (new AsyncFunction(executable(source)))();
          else throw err;
        }
      }
      return { ok: true, data: smartResult(value) };
    } catch (err) {
      const message = err?.message || String(err);
      return { ok: false, csp: /unsafe-eval|Content Security Policy|Refused to evaluate/i.test(message), error: { name: err?.name || "Error", message, stack: err?.stack || "" } };
    }
  })()`;
}
