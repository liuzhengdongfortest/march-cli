export function buildInitialPiPrompt(engine, prompt) {
  const providerContext = engine.buildProviderContext(prompt);
  return (providerContext.userMessages ?? [])
    .map((message) => message?.content)
    .filter(Boolean)
    .join("\n\n");
}

export function resetPiMessageHistory(session) {
  if (typeof session?.agent?.reset === "function") {
    session.agent.reset();
    return;
  }
  if (Array.isArray(session?.agent?.state?.messages)) {
    session.agent.state.messages = [];
  }
}
