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
  const source = toByteSource(buffer);
  const headerLength = Number(new DataView(source.buffer, source.byteOffset, HEADER_BYTES).getBigUint64(0, true));
  const headerStart = HEADER_BYTES;
  const headerEnd = headerStart + headerLength;
  const headerJson = new TextDecoder().decode(new Uint8Array(source.buffer, source.byteOffset + headerStart, headerLength));
  const header = JSON.parse(headerJson);
  return {
    names: Object.keys(header).filter((name) => name !== "__metadata__"),
    getTensor(name) {
      const descriptor = header[name];
      if (!descriptor) throw new Error(`Missing safetensors tensor: ${name}`);
      return readTensor(source, headerEnd, descriptor);
    },
  };
}

function readTensor(source, dataStart, descriptor) {
  const reader = DTYPE_READERS[descriptor.dtype];
  if (!reader) throw new Error(`Unsupported safetensors dtype: ${descriptor.dtype}`);
  const [start, end] = descriptor.data_offsets;
  const byteOffset = source.byteOffset + dataStart + start;
  const byteLength = end - start;
  const length = byteLength / reader.size;
  if (descriptor.dtype === "F32" && byteOffset % Float32Array.BYTES_PER_ELEMENT === 0) {
    return { values: new Float32Array(source.buffer, byteOffset, length), shape: descriptor.shape, dtype: descriptor.dtype };
  }
  const view = new DataView(source.buffer, byteOffset, byteLength);
  const values = new Float32Array(length);
  for (let index = 0; index < length; index += 1) values[index] = reader.read(view, index * reader.size);
  return { values, shape: descriptor.shape, dtype: descriptor.dtype };
}

function toByteSource(buffer) {
  if (buffer instanceof ArrayBuffer) return { buffer, byteOffset: 0, byteLength: buffer.byteLength };
  if (ArrayBuffer.isView(buffer)) return { buffer: buffer.buffer, byteOffset: buffer.byteOffset, byteLength: buffer.byteLength };
  throw new TypeError("safetensors input must be an ArrayBuffer or typed array view");
}
