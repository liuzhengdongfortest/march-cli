// Turn records are the chat-log source of truth. Legacy flat fields are read-only
// migration input; new writes must produce user/assistant Message objects only.
export function buildTurnRecord({ index, userContent = "", assistantContent = "", userExecutionJson = null, assistantExecutionJson = null } = {}) {
  return {
    index,
    user: buildMessage({ role: "user", content: userContent, executionJson: userExecutionJson }),
    assistant: buildMessage({ role: "assistant", content: assistantContent, executionJson: assistantExecutionJson }),
  };
}

export function normalizeTurnRecord(turn, fallbackIndex = 1) {
  const userContent = getTurnUserContent(turn);
  const assistantContent = getTurnAssistantContent(turn);
  return buildTurnRecord({
    index: Number.isFinite(turn?.index) ? turn.index : fallbackIndex,
    userContent,
    assistantContent,
    userExecutionJson: normalizeExecutionJson(turn?.user?.executionJson) ?? legacyUserExecutionJson(turn),
    assistantExecutionJson: normalizeExecutionJson(turn?.assistant?.executionJson) ?? legacyAssistantExecutionJson(turn),
  });
}

export function normalizeTurnRecords(turns = []) {
  if (!Array.isArray(turns)) return [];
  return turns.map((turn, index) => normalizeTurnRecord(turn, index + 1));
}

export function getTurnUserContent(turn) {
  return String(turn?.user?.content ?? turn?.userMessage ?? "");
}

export function getTurnAssistantContent(turn) {
  return String(turn?.assistant?.content ?? turn?.assistantMessage ?? "");
}

export function getTurnStartRecallHints(turn) {
  const fromExecution = turn?.user?.executionJson?.contextInputs?.turnStart?.userRecall
    ?.flatMap((input) => input?.hints ?? []) ?? [];
  return fromExecution.length > 0 ? fromExecution : (turn?.userRecallHints ?? []);
}

export function getTurnRecallHints(turn) {
  const recallInputs = [
    ...(turn?.user?.executionJson?.contextInputs?.turnStart?.userRecall ?? []),
    ...(turn?.assistant?.executionJson?.contextInputs?.inTurn ?? []),
  ];
  const hints = recallInputs.flatMap((input) => input?.hints ?? []);
  return [...(turn?.userRecallHints ?? []), ...hints];
}

export function getTurnToolCalls(turn) {
  return turn?.assistant?.executionJson?.toolCalls ?? turn?.toolCalls ?? [];
}

function buildMessage({ role, content, executionJson }) {
  const message = { role, content: String(content ?? "") };
  const normalizedExecution = normalizeExecutionJson(executionJson);
  if (normalizedExecution) message.executionJson = normalizedExecution;
  return message;
}

function normalizeExecutionJson(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length === 0) return null;
  return cloneJson(value);
}

function legacyUserExecutionJson(turn) {
  const hints = Array.isArray(turn?.userRecallHints) ? turn.userRecallHints : [];
  if (hints.length === 0) return null;
  return {
    schemaVersion: 1,
    contextInputs: {
      turnStart: {
        userRecall: [{ type: "recall", source: "user", delivery: "turn_start", customType: "march.recall", hints: cloneJson(hints) }],
      },
    },
  };
}

function legacyAssistantExecutionJson(turn) {
  const toolCalls = Array.isArray(turn?.toolCalls) ? turn.toolCalls : [];
  const assistantText = getTurnAssistantContent(turn);
  if (toolCalls.length === 0 && !assistantText) return null;
  return {
    schemaVersion: 1,
    status: "success",
    ...(toolCalls.length > 0 ? { toolCalls: cloneJson(toolCalls) } : {}),
    result: { assistantText },
  };
}

function cloneJson(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return null;
  }
}
