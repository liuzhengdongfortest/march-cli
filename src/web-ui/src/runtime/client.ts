import type { WebUiModel } from "../model";

export type RuntimeUiEvent =
  | { type: "web_user_message"; text: string }
  | { type: "turn_start" }
  | { type: "turn_end" }
  | { type: "assistant_reply_end" }
  | { type: "text_delta"; delta: string }
  | { type: "thinking_start" }
  | { type: "thinking_delta"; delta: string }
  | { type: "thinking_end"; tokens?: number }
  | { type: "tool_start"; name: string; args?: unknown }
  | { type: "tool_end"; name: string; isError?: boolean; result?: unknown }
  | { type: "edit_diff"; path: string; diffLines?: Array<{ type?: string; text?: string }> }
  | { type: "permission_request"; toolName: string; category?: string; params?: unknown }
  | { type: "status"; text: string }
  | { type: "retry_start"; errorMessage?: string }
  | { type: "retry_end"; success?: boolean; finalError?: string };

export async function fetchRuntimeSnapshot(): Promise<WebUiModel> {
  const response = await fetch("/api/snapshot");
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export async function submitRuntimeTurn(prompt: string) {
  const response = await fetch("/api/turn", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export function connectRuntimeEvents(onEvent: (event: RuntimeUiEvent) => void, onError: () => void) {
  const source = new EventSource("/api/events");
  source.addEventListener("runtime", (message) => {
    onEvent(JSON.parse((message as MessageEvent).data) as RuntimeUiEvent);
  });
  source.onerror = onError;
  return () => source.close();
}
