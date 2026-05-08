import { randomUUID } from "node:crypto";

export const ROOT_NODE_UUID = "00000000-0000-0000-0000-000000000000";

// Serialization helpers compatible with the nocturne schema
export function serializeRow(row) {
  if (!row) return null;
  const obj = {};
  for (const key of Object.keys(row)) {
    obj[key] = row[key];
  }
  return obj;
}

export function serializeMemoryRef(memory) {
  if (!memory) return null;
  return {
    id: memory.id,
    node_uuid: memory.node_uuid,
    content: memory.content,
    deprecated: !!memory.deprecated,
    migrated_to: memory.migrated_to,
    created_at: memory.created_at,
  };
}

export function newUUID() {
  return randomUUID();
}

export function escapeLikeLiteral(value) {
  return value.replace(/[%_]/g, "\\$&");
}
