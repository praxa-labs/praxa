import {
  MEMORY_RECORD_ORIGINS,
  type MemoryJsonObject,
  type MemoryJsonValue,
  type MemoryNamespace,
  type MemoryRecordOrigin,
  type MemoryRecallItem,
  type MemoryRecallMatch,
  type MemoryRetrievalMode,
  type MemorySource,
  type MemorySourceRecord,
} from "./contracts.js";
import { isPublicTimestamp } from "./timestamp.js";

const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const providers = new Set(["mem0", "zep", "graphiti", "langgraph", "letta", "openai_agents", "custom"]);
const retrievalModes = new Set(["semantic", "hybrid", "graph", "exact", "recent"]);
const recordKinds = new Set(["message", "fact", "summary", "episode", "pinned_context", "document", "entity", "edge"]);
const recordOrigins = new Set<string>(MEMORY_RECORD_ORIGINS);

export function assertBoundedInteger(value: number, name: string, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${name} must be an integer from ${minimum} through ${maximum}`);
  }
  return value;
}

export function assertSource(source: MemorySource): void {
  if (!identifierPattern.test(source.id)) {
    throw new Error("Memory source id must be 1-128 supported characters");
  }
  if (source.capabilities.readOnly !== true || source.capabilities.sourceLocalScores !== true) {
    throw new Error(`Memory source ${source.id} must be read-only and expose source-local scores`);
  }
  if (!providers.has(source.provider)) throw new Error(`Memory source ${source.id} declares an unsupported provider`);
  if (source.capabilities.retrievalModes.length === 0 || source.capabilities.recordKinds.length === 0) {
    throw new Error(`Memory source ${source.id} must declare retrieval modes and record kinds`);
  }
  if (source.capabilities.retrievalModes.some((mode) => !retrievalModes.has(mode))) {
    throw new Error(`Memory source ${source.id} declares an unsupported retrieval mode`);
  }
  if (source.capabilities.recordKinds.some((kind) => !recordKinds.has(kind))) {
    throw new Error(`Memory source ${source.id} declares an unsupported record kind`);
  }
  if (typeof source.capabilities.supportsAbort !== "boolean" || typeof source.capabilities.supportsFilter !== "boolean") {
    throw new Error(`Memory source ${source.id} must declare boolean adapter capabilities`);
  }
}

function assertIdentity(value: string, name: string): string {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > 256 || /[\u0000-\u001f\u007f]/u.test(normalized)) {
    throw new Error(`${name} must be 1-256 non-control characters`);
  }
  return normalized;
}

export function normalizeNamespace(namespace: MemoryNamespace): MemoryNamespace {
  const scope = namespace.scope?.map((segment, index) => assertIdentity(segment, `namespace.scope[${index}]`));
  if ((scope?.length ?? 0) > 16) throw new Error("namespace.scope exceeds 16 segments");
  return {
    tenantId: assertIdentity(namespace.tenantId, "namespace.tenantId"),
    subjectId: assertIdentity(namespace.subjectId, "namespace.subjectId"),
    ...(scope === undefined ? {} : { scope }),
  };
}

export function normalizeQuery(query: string): string {
  const normalized = query.trim();
  if (normalized.length === 0 || normalized.length > 32_768) {
    throw new Error("query must be 1-32768 characters");
  }
  return normalized;
}

export function assertRetrievalMode(value: string | undefined): void {
  if (value !== undefined && !retrievalModes.has(value)) throw new Error("mode is unsupported");
}

function isJsonValue(value: unknown, depth = 0): value is MemoryJsonValue {
  if (depth > 12) return false;
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.length <= 256 && value.every((entry) => isJsonValue(entry, depth + 1));
  if (typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const entries = Object.entries(value as Record<string, unknown>);
  return entries.length <= 256 && entries.every(([key, entry]) => key.length <= 256 && isJsonValue(entry, depth + 1));
}

export function assertJsonObject(value: MemoryJsonObject | undefined, name: string): void {
  if (value === undefined) return;
  if (!isJsonValue(value) || Array.isArray(value)) throw new Error(`${name} must be bounded JSON`);
  const serialized = JSON.stringify(value);
  if (serialized.length > 32_768) throw new Error(`${name} exceeds 32768 serialized characters`);
}

function timestamp(value: unknown, name: string): string | undefined {
  if (value === undefined) return undefined;
  if (!isPublicTimestamp(value) || value.length > 64) {
    throw new Error(`${name} is not an ISO timestamp`);
  }
  return value;
}

function provenanceIdentifiers(values: unknown, name: string): readonly string[] | undefined {
  if (values === undefined) return undefined;
  if (
    !Array.isArray(values)
    || values.length > 16
    || new Set(values).size !== values.length
    || values.some((value) => typeof value !== "string" || !identifierPattern.test(value))
  ) {
    throw new Error(`${name} must contain at most 16 unique supported identifiers`);
  }
  return values as readonly string[];
}

function sourceUrl(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new Error("sourceUrl must be an HTTPS URL");
  const normalized = value.trim();
  if (normalized.length > 2_048) throw new Error("sourceUrl exceeds 2048 characters");
  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new Error("sourceUrl must be an HTTPS URL");
  }
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "") {
    throw new Error("sourceUrl must be HTTPS without credentials");
  }
  return normalized;
}

type NormalizedSourceProvenance = Readonly<{
  origin: MemoryRecordOrigin;
  confidence: number;
  capturedAt: string;
  sourceUrl?: string;
  evidenceIds?: readonly string[];
  originChain?: readonly string[];
}>;

function normalizeRecordProvenance(
  value: unknown,
  sourceId: string,
  createdAt: string | undefined,
  retrievedAt: string,
): NormalizedSourceProvenance {
  if (value === undefined) {
    return { origin: "observed", confidence: 1, capturedAt: createdAt ?? retrievedAt };
  }
  if (
    value === null
    || typeof value !== "object"
    || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  ) {
    throw new Error(`Memory source ${sourceId} returned incomplete provenance; origin, confidence, and capturedAt are required`);
  }
  const record = value as Record<string, unknown>;
  if (["origin", "confidence", "capturedAt"].some((key) => record[key] === undefined)) {
    throw new Error(`Memory source ${sourceId} returned incomplete provenance; origin, confidence, and capturedAt are required`);
  }
  const origin = record["origin"];
  if (typeof origin !== "string" || !recordOrigins.has(origin)) {
    throw new Error(`Memory source ${sourceId} returned unsupported provenance origin`);
  }
  const confidence = record["confidence"];
  if (typeof confidence !== "number" || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new Error(`Memory source ${sourceId} returned provenance confidence outside 0-1`);
  }
  const capturedAt = timestamp(record["capturedAt"], "capturedAt");
  if (capturedAt === undefined) {
    throw new Error(`Memory source ${sourceId} returned incomplete provenance; origin, confidence, and capturedAt are required`);
  }
  const normalizedSourceUrl = sourceUrl(record["sourceUrl"]);
  const evidenceIds = provenanceIdentifiers(record["evidenceIds"], "evidenceIds");
  const originChain = provenanceIdentifiers(record["originChain"], "originChain");
  return {
    origin: origin as MemoryRecordOrigin,
    confidence,
    capturedAt,
    ...(normalizedSourceUrl === undefined ? {} : { sourceUrl: normalizedSourceUrl }),
    ...(evidenceIds === undefined ? {} : { evidenceIds }),
    ...(originChain === undefined ? {} : { originChain }),
  };
}

export function sourceQualifiedId(sourceId: string, sourceRecordId: string): string {
  return `${encodeURIComponent(sourceId)}:${encodeURIComponent(sourceRecordId)}`;
}

export function normalizeSourceRecord(
  source: MemorySource,
  record: MemorySourceRecord,
  namespace: MemoryNamespace,
  retrievalMode: MemoryRetrievalMode,
  retrievedAt: string,
  sourceRank: number,
): MemoryRecallItem {
  const sourceRecordId = record.sourceRecordId.trim();
  if (sourceRecordId.length === 0 || sourceRecordId.length > 512 || /[\u0000-\u001f\u007f]/u.test(sourceRecordId)) {
    throw new Error(`Memory source ${source.id} returned an invalid record id`);
  }
  const text = record.text.trim();
  if (text.length === 0 || text.length > 65_536) {
    throw new Error(`Memory source ${source.id} returned text outside the 1-65536 character bound`);
  }
  if (!source.capabilities.recordKinds.includes(record.kind)) {
    throw new Error(`Memory source ${source.id} returned undeclared record kind ${record.kind}`);
  }
  if (record.score !== undefined && !Number.isFinite(record.score)) {
    throw new Error(`Memory source ${source.id} returned a non-finite source-local score`);
  }
  assertJsonObject(record.metadata, `Memory source ${source.id} metadata`);
  const createdAt = timestamp(record.createdAt, "createdAt");
  const updatedAt = timestamp(record.updatedAt, "updatedAt");
  const provenance = normalizeRecordProvenance(record.provenance, source.id, createdAt, retrievedAt);
  const match: MemoryRecallMatch = {
    sourceId: source.id,
    provider: source.provider,
    sourceRecordId,
    retrievalMode,
    sourceRank,
    ...(record.score === undefined ? {} : { score: { value: record.score, semantics: "source_local" } }),
    ...(createdAt === undefined ? {} : { createdAt }),
    ...(updatedAt === undefined ? {} : { updatedAt }),
    ...(record.metadata === undefined ? {} : { metadata: record.metadata }),
    provenance: {
      sourceId: source.id,
      provider: source.provider,
      sourceRecordId,
      namespace,
      retrievedAt,
      ...provenance,
    },
  };
  return {
    id: sourceQualifiedId(source.id, sourceRecordId),
    kind: record.kind,
    text,
    matches: [match],
    ranking: { method: "reciprocal_rank_fusion", score: 0, rank: 0, rankConstant: 60, contributingSources: 1 },
  };
}

export function boundedError(error: unknown): Readonly<{ code: string; message: string }> {
  const candidate = error !== null && typeof error === "object" ? error as { code?: unknown; message?: unknown } : undefined;
  const code = typeof candidate?.code === "string" && /^[a-z0-9_:-]{1,64}$/u.test(candidate.code)
    ? candidate.code
    : "source_error";
  const message = typeof candidate?.message === "string" && candidate.message.trim().length > 0
    ? candidate.message.trim().slice(0, 300)
    : "Memory source failed";
  return { code, message };
}

export function abortReason(signal: AbortSignal): Error {
  if (signal.reason instanceof Error) return signal.reason;
  const error = new Error("Memory recall aborted");
  error.name = "AbortError";
  return error;
}
