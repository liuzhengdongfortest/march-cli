export async function runRunnerCleanup(cleanups) {
  const errors = [];
  for (const cleanup of cleanups) {
    try {
      await cleanup();
    } catch (err) {
      errors.push(err);
    }
  }
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) throw new AggregateError(errors, "Runner cleanup failed");
}
