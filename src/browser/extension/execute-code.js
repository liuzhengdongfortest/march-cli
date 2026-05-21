export function buildExecCode(code) {
  return `(async () => {
    function smartResult(value) {
      if (value == null || typeof value !== "object") return value;
      try { if (value.window === value && value.document) return "[Window: " + (value.location?.href || "about:blank") + "]"; } catch {}
      if (typeof Node !== "undefined" && value.nodeType === Node.ELEMENT_NODE) return value.outerHTML;
      if (typeof NodeList !== "undefined" && (value instanceof NodeList || value instanceof HTMLCollection)) {
        return Array.from(value).slice(0, 300).map((item) => item?.nodeType === Node.ELEMENT_NODE ? item.outerHTML : String(item));
      }
      try {
        return JSON.parse(JSON.stringify(value, (_key, item) => {
          if (item && typeof item === "object") {
            if (typeof Node !== "undefined" && item.nodeType === Node.ELEMENT_NODE) return item.outerHTML;
            try { if (item.window === item && item.document) return "[Window]"; } catch {}
          }
          return item;
        }));
      } catch (err) {
        return "[Unserializable: " + (err?.message || String(err)) + "]";
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
