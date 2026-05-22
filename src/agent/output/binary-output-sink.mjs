import { AsyncLocalStorage } from "node:async_hooks";
import { openFileWithDefaultApp } from "../../platform/open-file.mjs";

const sinkStorage = new AsyncLocalStorage();

export function withBinaryOutputSink(sink, fn) {
  return sinkStorage.run(sink, fn);
}

export async function sendBinaryOutput(binary, { openFile = openFileWithDefaultApp } = {}) {
  const sink = sinkStorage.getStore();
  if (sink?.sendBinary) return sink.sendBinary(binary);
  if (!binary.path && !binary.url) throw new Error("send_binary requires a path or url");
  if (binary.url) throw new Error("send_binary url output is only supported by gateway sinks");
  await openFile(binary.path);
  return { target: "local", opened: true };
}
