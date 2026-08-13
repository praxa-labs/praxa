import {
  MEMORY_PROVIDER_IDS,
  MEMORY_RECORD_KINDS,
  MEMORY_RECORD_ORIGINS,
  type MemoryProviderId,
  type MemoryRecordKind,
  type MemoryRecordOrigin,
} from "./contracts.js";
import { isPublicTimestamp } from "./timestamp.js";

export type MemoryRecordMetadataValue = string | number | boolean | null;
export type MemoryRecordMetadata = Readonly<Record<string, MemoryRecordMetadataValue>>;

export type MemoryRecordEnvelopeV1 = Readonly<{
  apiVersion: "v1";
  providerId: MemoryProviderId;
  sourceId: string;
  externalRecordId: string;
  revision: string;
  kind: MemoryRecordKind;
  subject: string;
  visibility: "subject";
  content: string;
  agentId?: string;
  threadId?: string;
  workspaceId?: string;
  purpose?: string;
  metadata: MemoryRecordMetadata;
  provenance: Readonly<{
    origin: MemoryRecordOrigin;
    confidence: number;
    capturedAt: string;
    sourceUrl?: string;
    evidenceIds: readonly string[];
    metadata: MemoryRecordMetadata;
  }>;
  occurredAt: string;
  observedAt: string;
  expiresAt?: string;
  originChain: readonly string[];
}>;

export type MemoryRecordEnvelopeV1Input = Omit<MemoryRecordEnvelopeV1, "metadata" | "provenance" | "originChain"> & Readonly<{
  metadata?: MemoryRecordMetadata;
  provenance: Omit<MemoryRecordEnvelopeV1["provenance"], "evidenceIds" | "metadata"> & Readonly<{
    evidenceIds?: readonly string[];
    metadata?: MemoryRecordMetadata;
  }>;
  originChain?: readonly string[];
}>;

const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const providerIds = new Set<string>(MEMORY_PROVIDER_IDS);
const recordKinds = new Set<string>(MEMORY_RECORD_KINDS);
const recordOrigins = new Set<string>(MEMORY_RECORD_ORIGINS);

function object(value: unknown, name: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error(`${name} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(record: Record<string, unknown>, allowed: readonly string[], required: readonly string[], name: string): void {
  const allowedKeys = new Set(allowed);
  const unknown = Object.keys(record).find((key) => !allowedKeys.has(key));
  if (unknown !== undefined) throw new Error(`${name} contains unknown field ${unknown}`);
  const missing = required.find((key) => record[key] === undefined);
  if (missing !== undefined) throw new Error(`${name} is missing ${missing}`);
}

function literal<T extends string>(value: unknown, expected: T, name: string): T {
  if (value !== expected) throw new Error(`${name} must be ${expected}`);
  return expected;
}

function identifier(value: unknown, name: string): string {
  if (typeof value !== "string" || !identifierPattern.test(value)) {
    throw new Error(`${name} must be a 1-128 character public identifier`);
  }
  return value;
}

function optionalIdentifier(value: unknown, name: string): string | undefined {
  return value === undefined ? undefined : identifier(value, name);
}

function timestamp(value: unknown, name: string): string {
  if (!isPublicTimestamp(value)) {
    throw new Error(`${name} must be an ISO timestamp with an offset`);
  }
  return value;
}

function httpsUrl(value: unknown, name: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new Error(`${name} must be an HTTPS URL of at most 2048 characters`);
  const normalized = value.trim();
  if (normalized.length > 2_048) throw new Error(`${name} must be an HTTPS URL of at most 2048 characters`);
  const url = new URL(normalized);
  if (url.protocol !== "https:") throw new Error(`${name} must use HTTPS`);
  return normalized;
}

function identifiers(value: unknown, name: string): readonly string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 16) throw new Error(`${name} must contain at most 16 identifiers`);
  const result = value.map((entry, index) => identifier(entry, `${name}[${index}]`));
  if (new Set(result).size !== result.length) throw new Error(`${name} identifiers must be unique`);
  return result;
}

function metadata(value: unknown, name: string): MemoryRecordMetadata {
  if (value === undefined) return {};
  const record = object(value, name);
  if (Object.keys(record).length > 32) throw new Error(`${name} has more than 32 keys`);
  const result: Record<string, MemoryRecordMetadataValue> = {};
  for (const [key, entry] of Object.entries(record)) {
    if (key.length === 0 || key.length > 64) throw new Error(`${name} keys must be 1-64 characters`);
    if (
      entry !== null
      && typeof entry !== "boolean"
      && (typeof entry !== "number" || !Number.isFinite(entry))
      && (typeof entry !== "string" || entry.length > 512)
    ) throw new Error(`${name}.${key} must be a bounded primitive`);
    result[key] = entry as MemoryRecordMetadataValue;
  }
  return result;
}

/** Validate and apply the same defaults as the hosted `/v1/memory` envelope. */
export function parseMemoryRecordEnvelopeV1(value: unknown): MemoryRecordEnvelopeV1 {
  const record = object(value, "memory envelope");
  exactKeys(record, [
    "apiVersion", "providerId", "sourceId", "externalRecordId", "revision", "kind", "subject", "visibility",
    "content", "agentId", "threadId", "workspaceId", "purpose", "metadata", "provenance", "occurredAt",
    "observedAt", "expiresAt", "originChain",
  ], [
    "apiVersion", "providerId", "sourceId", "externalRecordId", "revision", "kind", "subject", "visibility",
    "content", "provenance", "occurredAt", "observedAt",
  ], "memory envelope");
  if (typeof record["providerId"] !== "string" || !providerIds.has(record["providerId"])) throw new Error("providerId is unsupported");
  if (typeof record["kind"] !== "string" || !recordKinds.has(record["kind"])) throw new Error("kind is unsupported");
  if (typeof record["content"] !== "string") throw new Error("content must be a string");
  const content = record["content"].trim();
  if (content.length === 0 || content.length > 16_000) throw new Error("content must be 1-16000 trimmed characters");
  const provenance = object(record["provenance"], "provenance");
  exactKeys(provenance, ["origin", "confidence", "capturedAt", "sourceUrl", "evidenceIds", "metadata"], ["origin", "confidence", "capturedAt"], "provenance");
  if (typeof provenance["origin"] !== "string" || !recordOrigins.has(provenance["origin"])) throw new Error("provenance.origin is unsupported");
  if (typeof provenance["confidence"] !== "number" || !Number.isFinite(provenance["confidence"]) || provenance["confidence"] < 0 || provenance["confidence"] > 1) {
    throw new Error("provenance.confidence must be from 0 through 1");
  }
  const occurredAt = timestamp(record["occurredAt"], "occurredAt");
  const observedAt = timestamp(record["observedAt"], "observedAt");
  const expiresAt = record["expiresAt"] === undefined ? undefined : timestamp(record["expiresAt"], "expiresAt");
  if (Date.parse(observedAt) < Date.parse(occurredAt)) throw new Error("observedAt must not precede occurredAt");
  if (expiresAt !== undefined && Date.parse(expiresAt) <= Date.parse(observedAt)) throw new Error("expiresAt must follow observedAt");
  const sourceUrl = httpsUrl(provenance["sourceUrl"], "provenance.sourceUrl");
  const agentId = optionalIdentifier(record["agentId"], "agentId");
  const threadId = optionalIdentifier(record["threadId"], "threadId");
  const workspaceId = optionalIdentifier(record["workspaceId"], "workspaceId");
  const purpose = optionalIdentifier(record["purpose"], "purpose");
  return {
    apiVersion: literal(record["apiVersion"], "v1", "apiVersion"),
    providerId: record["providerId"] as MemoryProviderId,
    sourceId: identifier(record["sourceId"], "sourceId"),
    externalRecordId: identifier(record["externalRecordId"], "externalRecordId"),
    revision: identifier(record["revision"], "revision"),
    kind: record["kind"] as MemoryRecordKind,
    subject: identifier(record["subject"], "subject"),
    visibility: literal(record["visibility"], "subject", "visibility"),
    content,
    ...(agentId === undefined ? {} : { agentId }),
    ...(threadId === undefined ? {} : { threadId }),
    ...(workspaceId === undefined ? {} : { workspaceId }),
    ...(purpose === undefined ? {} : { purpose }),
    metadata: metadata(record["metadata"], "metadata"),
    provenance: {
      origin: provenance["origin"] as MemoryRecordOrigin,
      confidence: provenance["confidence"],
      capturedAt: timestamp(provenance["capturedAt"], "provenance.capturedAt"),
      ...(sourceUrl === undefined ? {} : { sourceUrl }),
      evidenceIds: identifiers(provenance["evidenceIds"], "provenance.evidenceIds"),
      metadata: metadata(provenance["metadata"], "provenance.metadata"),
    },
    occurredAt,
    observedAt,
    ...(expiresAt === undefined ? {} : { expiresAt }),
    originChain: identifiers(record["originChain"], "originChain"),
  };
}

export function createMemoryRecordEnvelopeV1(input: MemoryRecordEnvelopeV1Input): MemoryRecordEnvelopeV1 {
  return parseMemoryRecordEnvelopeV1(input);
}

export function isMemoryRecordEnvelopeV1(value: unknown): value is MemoryRecordEnvelopeV1 {
  try {
    parseMemoryRecordEnvelopeV1(value);
    return true;
  } catch {
    return false;
  }
}
