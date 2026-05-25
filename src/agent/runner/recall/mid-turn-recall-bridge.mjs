export function createMidTurnRecallBridge() {
  const messages = [];
  const tasks = new Set();
  return {
    reset() {
      messages.length = 0;
      tasks.clear();
    },
    track({ content, task } = {}) {
      if (content && !messages.includes(content)) messages.push(content);
      if (!task?.finally) return;
      tasks.add(task);
      task.finally(() => tasks.delete(task));
    },
    async wait() {
      if (tasks.size === 0) return;
      await Promise.allSettled([...tasks]);
    },
    messages() {
      return [...messages];
    },
  };
}
