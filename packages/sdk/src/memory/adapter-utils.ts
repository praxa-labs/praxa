import type { MemoryJsonObject, MemoryJsonValue, MemoryNamespace } from "./contracts.js";
import { abortReason } from "./normalize.js";

export type UnknownRecord = Record<string, unknown>;

export function object(value: unknown): UnknownRecord | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : undefined;
}

export function requiredMappedId(value: string | undefined, label: string): string {
  const normalized = value?.trim() ?? "";
  if (normalized.length === 0 || normalized.length > 256) {
    throw new Error(`${label} mapper must return a 1-256 character identifier`);
  }
  return normalized;
}

export function mappedNamespace<T>(mapper: (namespace: MemoryNamespace) => T, namespace: MemoryNamespace): T {
  const mapped = mapper(namespace);
  if (mapped === undefined || mapped === null) throw new Error("Memory namespace mapper returned no mapping");
  return mapped;
}

export function stringField(value: unknown, ...names: readonly string[]): string | undefined {
  const record = object(value);
  for (const name of names) {
    const candidate = record?.[name];
    if (typeof candidate === "string" && candidate.trim().length > 0) return candidate.trim();
  }
  return undefined;
}

export function timestampField(value: unknown, ...names: readonly string[]): string | undefined {
  const record = object(value);
  for (const name of names) {
    const candidate = record?.[name];
    if (typeof candidate === "string" && candidate.trim().length > 0) return candidate.trim();
    if (candidate instanceof Date) {
      if (Number.isNaN(candidate.getTime())) throw new Error(`Adapter returned an invalid ${name} date`);
      return candidate.toISOString();
    }
  }
  return undefined;
}

export function numberField(value: unknown, ...names: readonly string[]): number | undefined {
  const record = object(value);
  for (const name of names) {
    const candidate = record?.[name];
    if (typeof candidate === "number" && Number.isFinite(candidate)) return candidate;
  }
  return undefined;
}

export function arrayField(value: unknown, name: string): readonly unknown[] {
  const candidate = object(value)?.[name];
  return Array.isArray(candidate) ? candidate : [];
}

function jsonValue(value: unknown, depth = 0): MemoryJsonValue | undefined {
  if (depth > 8) return undefined;
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (Array.isArray(value)) {
    if (value.length > 128) return undefined;
    const mapped = value.map((entry) => jsonValue(entry, depth + 1));
    return mapped.every((entry) => entry !== undefined) ? mapped as readonly MemoryJsonValue[] : undefined;
  }
  const record = object(value);
  if (record === undefined || Object.keys(record).length > 128) return undefined;
  const output: Record<string, MemoryJsonValue> = {};
  for (const [key, entry] of Object.entries(record)) {
    const mapped = jsonValue(entry, depth + 1);
    if (mapped === undefined) return undefined;
    output[key] = mapped;
  }
  return output;
}

export function jsonObject(value: unknown): MemoryJsonObject | undefined {
  const mapped = jsonValue(value);
  if (mapped === undefined || Array.isArray(mapped) || typeof mapped !== "object") return undefined;
  if (JSON.stringify(mapped).length > 32_768) throw new Error("Adapter metadata exceeds 32768 serialized characters");
  return mapped as MemoryJsonObject;
}

export function textFromValue(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() || undefined;
  if (Array.isArray(value)) {
    const parts = value.map((part) => stringField(part, "text", "content", "value", "refusal", "transcript")).filter((part): part is string => part !== undefined);
    return parts.length > 0 ? parts.join("\n") : undefined;
  }
  const direct = stringField(value, "text", "content", "memory", "value", "summary", "fact", "name", "embedded_text", "refusal", "transcript");
  if (direct !== undefined) return direct;
  const mapped = jsonObject(value);
  if (mapped === undefined) return undefined;
  const serialized = JSON.stringify(mapped);
  return serialized === "{}" ? undefined : serialized;
}

export function sourceRecordId(value: unknown, fallback: string): string {
  return stringField(value, "id", "uuid", "uuid_", "key", "message_id") ?? fallback;
}

export function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw abortReason(signal);
}
