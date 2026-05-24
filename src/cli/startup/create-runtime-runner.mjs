import { createRunnerProcessClient } from "../../agent/runtime/runner-process-client.mjs";

export async function createRuntimeRunner({
  runnerOptions,
  ui,
  shellRuntime,
  refreshStatusBar,
} = {}) {
  const onModelPayload = ({ estimatedTokens }) => {
    refreshStatusBar?.({ contextTokens: estimatedTokens });
  };
  const onLspStatusChange = () => {
    refreshStatusBar?.();
  };

  const { runner } = await createRunnerProcessClient({ runnerOptions, ui, onModelPayload, onLspStatusChange });
  runner.shellRuntime ??= shellRuntime;
  return runner;
}
