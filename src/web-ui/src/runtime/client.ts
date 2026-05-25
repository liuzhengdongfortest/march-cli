import type { MemoryRecallHint, MemoryRecallReport, ProviderQuotaSnapshot, SessionSummary, WebUiModel } from "../model";

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
  | { type: "provider_quota_snapshot"; snapshot: ProviderQuotaSnapshot | null }
  | { type: "recall"; source: string; hints: MemoryRecallHint[]; report?: MemoryRecallReport | null }
  | { type: "status"; text: string }
  | { type: "retry_start"; errorMessage?: string }
  | { type: "retry_end"; success?: boolean; finalError?: string };

export type FsEntry = { name: string; path: string; kind: "root" | "directory" };

export async function fetchRuntimeSnapshot(sessionId?: string | null): Promise<WebUiModel> {
  const response = await fetch(apiPath("/api/snapshot", { sessionId }));
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export async function createRuntimeSession(workspacePath: string): Promise<{ session: SessionSummary; snapshot: WebUiModel }> {
  const response = await fetch("/api/sessions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ workspacePath }),
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export async function fetchFsRoots(): Promise<FsEntry[]> {
  const response = await fetch("/api/fs/roots");
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()).roots;
}

export async function fetchFsList(path: string): Promise<FsEntry[]> {
  const response = await fetch(apiPath("/api/fs/list", { path }));
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()).entries;
}

export async function fetchProviderQuota(sessionId: string): Promise<ProviderQuotaSnapshot | null> {
  const response = await fetch(apiPath("/api/provider-quota", { sessionId }));
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()).snapshot ?? null;
}

export async function submitRuntimeTurn(sessionId: string, prompt: string) {
  const response = await fetch("/api/turn", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId, prompt }),
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export function connectRuntimeEvents(sessionId: string, onEvent: (event: RuntimeUiEvent) => void, onError: () => void) {
  const source = new EventSource(apiPath("/api/events", { sessionId }));
  source.addEventListener("runtime", (message) => {
    onEvent(JSON.parse((message as MessageEvent).data) as RuntimeUiEvent);
  });
  source.onerror = onError;
  return () => source.close();
}

function apiPath(path: string, params: Record<string, string | null | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) query.set(key, value);
  const suffix = query.toString();
  return suffix ? `${path}?${suffix}` : path;
}
