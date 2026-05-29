import { homedir } from "node:os";
import { join } from "node:path";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { toolText } from "../../agent/tool-result.mjs";
import { callBrowserDaemon } from "../client/rpc.mjs";
import { truncateToolText } from "../extension/output-limits.js";

export function createBrowserTools({ stateRoot = join(homedir(), ".march") } = {}) {
  return [
    browserTabsTool(stateRoot),
    browserOpenTool(stateRoot),
    browserReadTool(stateRoot),
    browserScriptTool(stateRoot),
  ];
}

function browserTabsTool(stateRoot) {
  return defineTool({
    name: "browser_tabs",
    label: "Browser Tabs",
    description: "List all tabs visible to the March browser extension. Use this first to choose a tabId.",
    parameters: Type.Object({}),
    execute: async () => safeToolJson(() => callBrowserDaemon({ stateRoot, method: "tabs" })),
  });
}

function browserOpenTool(stateRoot) {
  return defineTool({
    name: "browser_open",
    label: "Browser Open",
    description: "Create, navigate, focus, close, reload, back, or forward browser tabs. Returns the affected tab when available.",
    parameters: Type.Object({
      action: Type.String({ enum: ["new", "navigate", "focus", "close", "reload", "back", "forward"] }),
      url: Type.Optional(Type.String({ description: "URL for new or navigate actions." })),
      tabId: Type.Optional(Type.String({ description: "Target tab id for existing-tab actions." })),
      active: Type.Optional(Type.Boolean({ description: "Whether a new tab should become active. Default true." })),
    }),
    execute: async (_id, params) => safeToolJson(() => callBrowserDaemon({ stateRoot, method: "open", params })),
  });
}

function browserReadTool(stateRoot) {
  return defineTool({
    name: "browser_read",
    label: "Browser Read",
    description: "Read content from a specific browser tab. Defaults to visible text and interactive elements; can include HTML.",
    parameters: Type.Object({
      tabId: Type.String({ description: "Target tab id from browser_tabs or browser_open." }),
      include: Type.Optional(Type.Object({
        text: Type.Optional(Type.Boolean()),
        html: Type.Optional(Type.Boolean()),
        elements: Type.Optional(Type.Boolean()),
      })),
    }),
    execute: async (_id, params) => safeToolJson(() => callBrowserDaemon({ stateRoot, method: "read", params })),
  });
}

function browserScriptTool(stateRoot) {
  return defineTool({
    name: "browser_script",
    label: "Browser Script",
    description: "Execute arbitrary JavaScript in a specific browser tab. The code may return a JSON-serializable value or a Promise.",
    parameters: Type.Object({
      tabId: Type.String({ description: "Target tab id from browser_tabs or browser_open." }),
      code: Type.String({ description: "JavaScript function body. Use return to send a result back." }),
      awaitPromise: Type.Optional(Type.Boolean({ description: "Await a returned Promise. Default true." })),
      timeoutMs: Type.Optional(Type.Number({ description: "Request timeout in milliseconds. Default 30000." })),
    }),
    execute: async (_id, params) => safeToolJson(() => callBrowserDaemon({
      stateRoot,
      method: "script",
      params,
      timeoutMs: params.timeoutMs ?? 30000,
    })),
  });
}

async function safeToolJson(run) {
  try {
    return toolJson(await run());
  } catch (err) {
    return toolJson({ ok: false, error: err.message }, { error: true });
  }
}

function toolJson(payload, details = {}) {
  const formatted = JSON.stringify(payload, null, 2);
  const limited = truncateToolText(formatted);
  return toolText(limited.text, { ...details, browserOutputTruncated: limited.truncated, originalLength: limited.originalLength, returnedLength: limited.returnedLength });
}
