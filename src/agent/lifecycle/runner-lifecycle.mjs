export function createRunnerLifecycle() {
  let pendingAction = null;
  return {
    requestRuntimeRestart({ reason = "" } = {}) {
      pendingAction = { type: "restart_runtime", reason };
    },
    takePendingAction() {
      const action = pendingAction;
      pendingAction = null;
      return action;
    },
    clearPendingAction() {
      pendingAction = null;
    },
  };
}
