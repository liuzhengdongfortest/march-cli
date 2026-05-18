export async function closeMarchRuntime({ runner, memoryStore, ui, logger = null, blankLine = false }) {
  let firstError = null;
  try {
    await runner.dispose();
  } catch (err) {
    firstError ??= err;
  }
  try {
    memoryStore.close();
  } catch (err) {
    firstError ??= err;
  }
  try {
    if (blankLine) ui.writeln("");
    await ui.close();
  } catch (err) {
    firstError ??= err;
  }
  if (firstError) {
    logger?.error("process.close.error", { error: firstError });
    throw firstError;
  }
}
