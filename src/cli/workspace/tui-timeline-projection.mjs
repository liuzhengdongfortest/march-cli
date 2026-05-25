export function createTuiTimelineProjection() {
  let blocks = [];
  let openAssistantBlock = null;
  let openThinkingBlock = null;
  let openToolBlocks = [];
  let nextBlockIndex = 1;

  return {
    apply(event) {
      applyProjectionEvent(event);
    },
    rebuild(events) {
      resetProjection();
      for (const event of events) applyProjectionEvent(event);
    },
    clear() {
      resetProjection();
    },
    getBlocks() {
      return blocks.map((block) => structuredCloneSafe(block));
    },
    getMetadata() {
      return {
        blockCount: blocks.length,
        openAssistant: Boolean(openAssistantBlock),
        openThinking: Boolean(openThinkingBlock),
        openToolCount: openToolBlocks.length,
      };
    },
  };

  function applyProjectionEvent(event) {
    const [first, second, third] = event.args ?? [];
    switch (event.method) {
      case "turnStart":
        closeAssistantBlock();
        blocks.push(createBlock("turn", event.at, { phase: "start" }));
        break;
      case "turnEnd":
        closeAssistantBlock(event.at);
        closeThinkingBlock(event.at);
        blocks.push(createBlock("turn", event.at, { phase: "end" }));
        break;
      case "textDelta":
        ensureAssistantBlock(event.at).content += String(first ?? "");
        touchBlock(openAssistantBlock, event.at);
        break;
      case "assistantReplyEnd":
        closeAssistantBlock(event.at);
        break;
      case "thinkingStart":
        closeThinkingBlock(event.at);
        openThinkingBlock = createBlock("thinking", event.at, { content: "", closed: false });
        blocks.push(openThinkingBlock);
        break;
      case "thinkingDelta":
        ensureThinkingBlock(event.at).content += String(first ?? "");
        touchBlock(openThinkingBlock, event.at);
        break;
      case "thinkingEnd":
        ensureThinkingBlock(event.at).tokens = first ?? null;
        closeThinkingBlock(event.at);
        break;
      case "thinkingBlock":
        closeThinkingBlock(event.at);
        blocks.push(createBlock("thinking", event.at, { tokens: first ?? null, content: String(second ?? ""), closed: true }));
        break;
      case "toolStart": {
        closeAssistantBlock(event.at);
        const block = createBlock("tool", event.at, { name: first ?? null, args: second ?? null, result: null, isError: false, closed: false });
        blocks.push(block);
        openToolBlocks.push(block);
        break;
      }
      case "toolEnd": {
        const block = popOpenToolBlock(first);
        if (block) {
          block.name ??= first ?? null;
          block.isError = Boolean(second);
          block.result = third ?? null;
          block.closed = true;
          touchBlock(block, event.at);
        } else {
          blocks.push(createBlock("tool", event.at, { name: first ?? null, isError: Boolean(second), result: third ?? null, closed: true }));
        }
        break;
      }
      case "write":
      case "writeln":
        closeAssistantBlock(event.at);
        blocks.push(createBlock("output", event.at, { content: String(first ?? ""), newline: event.method === "writeln" }));
        break;
      case "status":
        blocks.push(createBlock("status", event.at, { content: String(first ?? "") }));
        break;
      case "recall":
        blocks.push(createBlock("recall", event.at, { hints: first?.hints ?? [], report: first?.report ?? null }));
        break;
      case "editDiff":
        closeAssistantBlock(event.at);
        blocks.push(createBlock("editDiff", event.at, { path: first ?? null, diffLines: second ?? [] }));
        break;
      case "retryStart":
      case "retryEnd":
        blocks.push(createBlock("retry", event.at, { method: event.method, payload: first ?? null }));
        break;
      default:
        blocks.push(createBlock("event", event.at, { method: event.method, args: event.args ?? [] }));
        break;
    }
  }

  function ensureAssistantBlock(at) {
    if (!openAssistantBlock) {
      openAssistantBlock = createBlock("assistant", at, { content: "", closed: false });
      blocks.push(openAssistantBlock);
    }
    return openAssistantBlock;
  }

  function closeAssistantBlock(at = null) {
    if (!openAssistantBlock) return;
    openAssistantBlock.closed = true;
    touchBlock(openAssistantBlock, at);
    openAssistantBlock = null;
  }

  function ensureThinkingBlock(at) {
    if (!openThinkingBlock) {
      openThinkingBlock = createBlock("thinking", at, { content: "", closed: false });
      blocks.push(openThinkingBlock);
    }
    return openThinkingBlock;
  }

  function closeThinkingBlock(at = null) {
    if (!openThinkingBlock) return;
    openThinkingBlock.closed = true;
    touchBlock(openThinkingBlock, at);
    openThinkingBlock = null;
  }

  function popOpenToolBlock(name) {
    if (openToolBlocks.length === 0) return null;
    if (name == null) return openToolBlocks.pop();
    const index = findLastIndex(openToolBlocks, (block) => block.name === name);
    if (index < 0) return openToolBlocks.pop();
    return openToolBlocks.splice(index, 1)[0];
  }
  function resetProjection() {
    blocks = [];
    openAssistantBlock = null;
    openThinkingBlock = null;
    openToolBlocks = [];
    nextBlockIndex = 1;
  }

  function createBlock(type, at, fields = {}) {
    const id = `${type}-${nextBlockIndex++}`;
    return { id, type, createdAt: at ?? null, updatedAt: at ?? null, ...fields };
  }
}

function touchBlock(block, at = null) {
  if (!block || at == null) return;
  block.updatedAt = at;
}

function findLastIndex(items, predicate) {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index], index)) return index;
  }
  return -1;
}

function structuredCloneSafe(value) {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}
