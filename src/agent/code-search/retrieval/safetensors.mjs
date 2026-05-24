import { readFile } from "node:fs/promises";

const HEADER_BYTES = 8;
const DTYPE_READERS = {
  F32: { size: 4, read: (view, offset) => view.getFloat32(offset, true) },
  F64: { size: 8, read: (view, offset) => view.getFloat64(offset, true) },
  I32: { size: 4, read: (view, offset) => view.getInt32(offset, true) },
  I64: { size: 8, read: (view, offset) => Number(view.getBigInt64(offset, true)) },
  U32: { size: 4, read: (view, offset) => view.getUint32(offset, true) },
  U64: { size: 8, read: (view, offset) => Number(view.getBigUint64(offset, true)) },
};

export async function readSafetensors(filePath) {
  const buffer = await readFile(filePath);
  return parseSafetensors(buffer);
}

export function parseSafetensors(buffer) {
  const data = toArrayBuffer(buffer);
  const headerLength = Number(new DataView(data, 0, HEADER_BYTES).getBigUint64(0, true));
  const headerStart = HEADER_BYTES;
  const headerEnd = headerStart + headerLength;
  const headerJson = new TextDecoder().decode(new Uint8Array(data, headerStart, headerLength));
  const header = JSON.parse(headerJson);
  return {
    names: Object.keys(header).filter((name) => name !== "__metadata__"),
    getTensor(name) {
      const descriptor = header[name];
      if (!descriptor) throw new Error(`Missing safetensors tensor: ${name}`);
      return readTensor(data, headerEnd, descriptor);
    },
  };
}

function readTensor(data, dataStart, descriptor) {
  const reader = DTYPE_READERS[descriptor.dtype];
  if (!reader) throw new Error(`Unsupported safetensors dtype: ${descriptor.dtype}`);
  const [start, end] = descriptor.data_offsets;
  const byteOffset = dataStart + start;
  const length = (end - start) / reader.size;
  const view = new DataView(data, byteOffset, end - start);
  const values = new Float32Array(length);
  for (let index = 0; index < length; index += 1) values[index] = reader.read(view, index * reader.size);
  return { values, shape: descriptor.shape, dtype: descriptor.dtype };
}

function toArrayBuffer(buffer) {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}
