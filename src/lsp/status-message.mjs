export function formatLspServiceEvent(event) {
  const id = event?.id ? String(event.id) : "server";
  if (event?.status === "attached") return `LSP attached: ${id}`;
  if (event?.status === "starting") return `LSP starting: ${id}`;
  if (event?.status === "installing") return `LSP installing: ${id} - ${event.reason}`;
  if (event?.status === "failed") return `LSP failed: ${id} - ${event.reason}`;
  if (event?.status === "unavailable") return `LSP unavailable: ${id} - ${event.reason}`;
  return `LSP ${event?.status ?? "status"}: ${id}`;
}
