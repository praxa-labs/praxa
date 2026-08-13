import { MemorySourceUnsupportedError, type MemoryNamespace, type MemoryRecordKind, type MemoryRetrievalMode, type MemorySource, type MemorySourceRecord } from "../contracts.js";
import { mappedNamespace, throwIfAborted } from "../adapter-utils.js";

export type GraphitiTransportRecord = MemorySourceRecord & Readonly<{
  kind: "fact" | "episode" | "entity" | "edge";
}>;

export interface GraphitiSearchTransport<Namespace = unknown> {
  search(input: Readonly<{
    query: string;
    namespace: Namespace;
    limit: number;
    mode?: MemoryRetrievalMode;
    signal: AbortSignal;
  }>): Promise<readonly GraphitiTransportRecord[]>;
}

export type GraphitiMemorySourceOptions<Namespace = unknown> = Readonly<{
  id?: string;
  transport: GraphitiSearchTransport<Namespace>;
  mapNamespace: (namespace: MemoryNamespace) => Namespace;
  recordKinds?: readonly ("fact" | "episode" | "entity" | "edge")[];
  retrievalModes?: readonly ("graph" | "hybrid" | "semantic")[];
  supportsAbort?: boolean;
}>;

export function createGraphitiMemorySource<Namespace = unknown>(options: GraphitiMemorySourceOptions<Namespace>): MemorySource {
  const recordKinds: readonly MemoryRecordKind[] = [...(options.recordKinds ?? ["fact", "episode", "entity", "edge"])];
  const retrievalModes: readonly MemoryRetrievalMode[] = [...(options.retrievalModes ?? ["graph"])] as readonly MemoryRetrievalMode[];
  const allowedKinds = new Set<MemoryRecordKind>(["fact", "episode", "entity", "edge"]);
  const allowedModes = new Set<MemoryRetrievalMode>(["graph", "hybrid", "semantic"]);
  if (
    recordKinds.length === 0
    || new Set(recordKinds).size !== recordKinds.length
    || recordKinds.some((kind) => !allowedKinds.has(kind))
  ) {
    throw new Error("Graphiti recordKinds must contain unique fact, episode, entity, or edge kinds");
  }
  if (
    retrievalModes.length === 0
    || new Set(retrievalModes).size !== retrievalModes.length
    || retrievalModes.some((mode) => !allowedModes.has(mode))
  ) {
    throw new Error("Graphiti retrievalModes must contain unique graph, hybrid, or semantic modes");
  }
  if (options.supportsAbort !== undefined && typeof options.supportsAbort !== "boolean") {
    throw new Error("Graphiti supportsAbort must be a boolean");
  }
  return {
    id: options.id ?? "graphiti",
    provider: "graphiti",
    capabilities: {
      retrievalModes,
      recordKinds,
      readOnly: true,
      sourceLocalScores: true,
      supportsAbort: options.supportsAbort ?? false,
      supportsFilter: false,
    },
    async recall(request): Promise<readonly MemorySourceRecord[]> {
      throwIfAborted(request.signal);
      const mode = request.mode ?? retrievalModes[0];
      if (mode === undefined || !retrievalModes.includes(mode)) {
        throw new MemorySourceUnsupportedError(`Memory source ${options.id ?? "graphiti"} does not support ${mode ?? "unknown"} retrieval`);
      }
      const records = await options.transport.search({
        query: request.query,
        namespace: mappedNamespace(options.mapNamespace, request.namespace),
        limit: request.limit,
        mode,
        signal: request.signal,
      });
      throwIfAborted(request.signal);
      return records;
    },
  };
}
