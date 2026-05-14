export async function createSidecarWriteFailure({ runtimeHost, sourceSessionFile, action, cause }) {
  const causeMessage = cause?.message ?? String(cause);
  const baseMessage = `failed to write pi session sidecar after ${action}: ${causeMessage}`;
  try {
    await runtimeHost.switchSession(sourceSessionFile);
    return new Error(`${baseMessage}; rolled back to source session`);
  } catch (rollbackErr) {
    return new Error(`${baseMessage}; rollback failed: ${rollbackErr.message}`);
  }
}
