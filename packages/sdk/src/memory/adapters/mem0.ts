import type {
  MemoryJsonObject,
  MemoryNamespace,
  MemorySource,
  MemorySourceRecord,
} from "../contracts.js";
import { arrayField, jsonObject, mappedNamespace, numberField, sourceRecordId, stringField, throwIfAborted, timestampField } from "../adapter-utils.js";
import { assertJsonObject } from "../normalize.js";

export interface Mem0SearchClient {
  search(
    query: string,
    options: Readonly<{ filters: MemoryJsonObject; topK: number; threshold?: number; rerank?: boolean }>,
  ): Promise<unknown>;
}

export type Mem0MemorySourceOptions = Readonly<{
  id?: string;
  client: Mem0SearchClient;
  mapNamespace: (namespace: MemoryNamespace) => MemoryJsonObject;
  threshold?: number;
  rerank?: boolean;
}>;

const entityFilterNames = new Set(["userId", "agentId", "appId", "runId"]);

function isPositiveEntityEquality(value: unknown): boolean {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return false;
  return entries.every(([key, entry]) => {
    return entityFilterNames.has(key)
      && typeof entry === "string"
      && entry.trim().length > 0
      && entry.length <= 256
      && !entry.includes("*")
      && !/[\u0000-\u001f\u007f]/u.test(entry);
  });
}

export function createMem0MemorySource(options: Mem0MemorySourceOptions): MemorySource {
  if (options.threshold !== undefined && (!Number.isFinite(options.threshold) || options.threshold < 0 || options.threshold > 1)) {
    throw new RangeError("Mem0 threshold must be from 0 through 1");
  }
  if (options.rerank !== undefined && typeof options.rerank !== "boolean") {
    throw new Error("Mem0 rerank must be a boolean");
  }
  return {
    id: options.id ?? "mem0",
    provider: "mem0",
    capabilities: {
      retrievalModes: ["hybrid"],
      recordKinds: ["fact"],
      readOnly: true,
      sourceLocalScores: true,
      supportsAbort: false,
      supportsFilter: true,
    },
    async recall(request): Promise<readonly MemorySourceRecord[]> {
      throwIfAborted(request.signal);
      const namespaceFilters = mappedNamespace(options.mapNamespace, request.namespace);
      assertJsonObject(namespaceFilters, "Mem0 namespace mapping");
      if (!isPositiveEntityEquality(namespaceFilters)) {
        throw new Error("Mem0 namespace mapping must use camelCase positive equality for userId, agentId, appId, or runId");
      }
      const filters: MemoryJsonObject = request.filter === undefined
        ? namespaceFilters
        : { AND: [namespaceFilters, request.filter] };
      const response = await options.client.search(request.query, {
        filters,
        topK: request.limit,
        ...(options.threshold === undefined ? {} : { threshold: options.threshold }),
        ...(options.rerank === undefined ? {} : { rerank: options.rerank }),
      });
      throwIfAborted(request.signal);
      return arrayField(response, "results").map((entry, index) => {
        const text = stringField(entry, "memory");
        if (text === undefined) throw new Error("Mem0 returned a result without memory text");
        const metadata = jsonObject((entry as Record<string, unknown> | null)?.["metadata"]);
        const score = numberField(entry, "score");
        const createdAt = timestampField(entry, "createdAt", "created_at");
        const updatedAt = timestampField(entry, "updatedAt", "updated_at");
        return {
          sourceRecordId: sourceRecordId(entry, `result-${index}`),
          kind: "fact",
          text,
          ...(score === undefined ? {} : { score }),
          ...(createdAt === undefined ? {} : { createdAt }),
          ...(updatedAt === undefined ? {} : { updatedAt }),
          ...(metadata === undefined ? {} : { metadata }),
        };
      });
    },
  };
}
