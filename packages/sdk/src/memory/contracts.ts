export const MEMORY_FEDERATION_SCHEMA_VERSION = "praxa-memory-federation-v1" as const;

export const MEMORY_PROVIDER_IDS = [
  "mem0",
  "zep",
  "graphiti",
  "langgraph",
  "letta",
  "openai_agents",
  "custom",
] as const;

export const MEMORY_RECORD_KINDS = [
  "message",
  "fact",
  "summary",
  "episode",
  "pinned_context",
  "document",
  "entity",
  "edge",
] as const;

export const MEMORY_RECORD_ORIGINS = ["explicit", "observed", "inferred", "imported"] as const;

export type MemoryProviderId = typeof MEMORY_PROVIDER_IDS[number];

export type MemoryRecordKind = typeof MEMORY_RECORD_KINDS[number];
export type MemoryRecordOrigin = typeof MEMORY_RECORD_ORIGINS[number];

export type MemoryRetrievalMode = "semantic" | "hybrid" | "graph" | "exact" | "recent";
export type MemorySourceStatus = "ok" | "unavailable" | "unsupported" | "timed_out" | "error";

export type MemoryJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly MemoryJsonValue[]
  | MemoryJsonObject;

export type MemoryJsonObject = Readonly<{ [key: string]: MemoryJsonValue }>;

/** Caller-owned identity. Adapters must explicitly map it to provider namespaces. */
export type MemoryNamespace = Readonly<{
  tenantId: string;
  subjectId: string;
  scope?: readonly string[];
}>;

export type MemoryRecallRequest = Readonly<{
  query: string;
  namespace: MemoryNamespace;
  limit?: number;
  mode?: MemoryRetrievalMode;
  filter?: MemoryJsonObject;
  sourceIds?: readonly string[];
  timeoutMs?: number;
  signal?: AbortSignal;
}>;

export type MemorySourceCapabilities = Readonly<{
  retrievalModes: readonly MemoryRetrievalMode[];
  recordKinds: readonly MemoryRecordKind[];
  readOnly: true;
  sourceLocalScores: true;
  supportsAbort: boolean;
  supportsFilter: boolean;
}>;

export type MemorySourceRecord = Readonly<{
  sourceRecordId: string;
  kind: MemoryRecordKind;
  text: string;
  score?: number;
  createdAt?: string;
  updatedAt?: string;
  metadata?: MemoryJsonObject;
  provenance?: Readonly<{
    origin: MemoryRecordOrigin;
    confidence: number;
    capturedAt: string;
    sourceUrl?: string;
    evidenceIds?: readonly string[];
    originChain?: readonly string[];
  }>;
}>;

export type MemorySourceRecallRequest = Readonly<{
  query: string;
  namespace: MemoryNamespace;
  limit: number;
  mode?: MemoryRetrievalMode;
  filter?: MemoryJsonObject;
  signal: AbortSignal;
}>;

export interface MemorySource {
  readonly id: string;
  readonly provider: MemoryProviderId;
  readonly capabilities: MemorySourceCapabilities;
  recall(request: MemorySourceRecallRequest): Promise<readonly MemorySourceRecord[]>;
}

export type MemoryRecallMatch = Readonly<{
  sourceId: string;
  provider: MemoryProviderId;
  sourceRecordId: string;
  retrievalMode: MemoryRetrievalMode;
  sourceRank: number;
  score?: Readonly<{ value: number; semantics: "source_local" }>;
  createdAt?: string;
  updatedAt?: string;
  metadata?: MemoryJsonObject;
  provenance: Readonly<{
    sourceId: string;
    provider: MemoryProviderId;
    sourceRecordId: string;
    namespace: MemoryNamespace;
    retrievedAt: string;
    origin: MemoryRecordOrigin;
    confidence: number;
    capturedAt: string;
    sourceUrl?: string;
    evidenceIds?: readonly string[];
    originChain?: readonly string[];
  }>;
}>;

export type MemoryRecallItem = Readonly<{
  /** Source-qualified identifier of the first match; not a provider-independent identity claim. */
  id: string;
  kind: MemoryRecordKind;
  text: string;
  /** All source-local matches retained when exact normalized content is grouped. */
  matches: readonly MemoryRecallMatch[];
  ranking: Readonly<{
    method: "reciprocal_rank_fusion";
    /** Computed only from per-source ordinal ranks; raw provider scores are never compared. */
    score: number;
    rank: number;
    rankConstant: 60;
    contributingSources: number;
  }>;
}>;

export type MemorySourceResult = Readonly<{
  sourceId: string;
  provider: MemoryProviderId;
  status: MemorySourceStatus;
  retrievalMode: MemoryRetrievalMode;
  durationMs: number;
  itemCount: number;
  duplicateCount: number;
  truncated: boolean;
  error?: Readonly<{ code: string; message: string }>;
}>;

export type MemoryFederationResult = Readonly<{
  schemaVersion: typeof MEMORY_FEDERATION_SCHEMA_VERSION;
  status: "ok" | "partial" | "failed";
  namespace: MemoryNamespace;
  query: string;
  items: readonly MemoryRecallItem[];
  sources: readonly MemorySourceResult[];
  deduplication: Readonly<{
    strategy: "exact_normalized_content";
    collapsedCount: number;
  }>;
  ranking: Readonly<{
    method: "reciprocal_rank_fusion";
    rankConstant: 60;
    tieBreak: "normalized_content_codepoint";
  }>;
  startedAt: string;
  completedAt: string;
}>;

export type MemoryFederationOptions = Readonly<{
  sources: readonly MemorySource[];
  maxConcurrency?: number;
  maxSources?: number;
  maxResultsPerSource?: number;
  maxTotalResults?: number;
  defaultTimeoutMs?: number;
  now?: () => Date;
}>;

export class MemorySourceUnavailableError extends Error {
  readonly code = "source_unavailable" as const;

  constructor(message = "Memory source is unavailable") {
    super(message);
    this.name = "MemorySourceUnavailableError";
  }
}

export class MemorySourceUnsupportedError extends Error {
  readonly code = "source_unsupported" as const;

  constructor(message = "Memory source does not support this request") {
    super(message);
    this.name = "MemorySourceUnsupportedError";
  }
}
