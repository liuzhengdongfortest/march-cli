export function createRuntimeHost({ runtime, sessionBinding, onRebind = null }) {
  const bindSession = async (session) => {
    sessionBinding.set(session);
    if (onRebind) await onRebind(session);
    return session;
  };

  runtime.setRebindSession?.(bindSession);
  sessionBinding.set(runtime.session);

  return {
    get runtime() {
      return runtime;
    },
    getSession() {
      return sessionBinding.get();
    },
    getDiagnostics() {
      return runtime.diagnostics ?? [];
    },
    async switchSession(sessionPath, options) {
      return runtime.switchSession(sessionPath, options);
    },
    async newSession(options) {
      return runtime.newSession(options);
    },
    async fork(entryId, options) {
      return runtime.fork(entryId, options);
    },
    async dispose() {
      return runtime.dispose();
    },
  };
}
