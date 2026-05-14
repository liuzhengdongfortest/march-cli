export function createSessionBinding(initialSession) {
  let current = initialSession;
  return {
    get() {
      return current;
    },
    set(nextSession) {
      current = nextSession;
      return current;
    },
  };
}
