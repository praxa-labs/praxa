import type { MemoryNamespace, MemoryRecordKind, MemorySource, MemorySourceRecord } from "../contracts.js";
import { arrayField, jsonObject, mappedNamespace, numberField, requiredMappedId, sourceRecordId, stringField, textFromValue, throwIfAborted, timestampField } from "../adapter-utils.js";

export type ZepGraphNamespace = Readonly<{ userId: string; graphId?: never } | { userId?: never; graphId: string }>;
export type ZepGraphSearchQuery = Readonly<{
  query: string;
  userId?: string;
  graphId?: string;
  scope?: "edges" | "nodes" | "episodes";
  limit?: number;
}>;
export type ZepGraphSearchRequestOptions = Readonly<{ abortSignal?: AbortSignal }>;
export interface ZepGraphSearchClient {
  graph: Readonly<{ search(input: ZepGraphSearchQuery, options?: ZepGraphSearchRequestOptions): Promise<unknown> }>;
}
export type ZepMemorySourceOptions = Readonly<{
  id?: string;
  client: ZepGraphSearchClient;
  mapNamespace: (namespace: MemoryNamespace) => ZepGraphNamespace;
  scope?: "edges" | "nodes" | "episodes";
}>;

const scopeKind = { edges: "edge", nodes: "entity", episodes: "episode" } as const;

export function createZepMemorySource(options: ZepMemorySourceOptions): MemorySource {
  const scope = options.scope ?? "edges";
  if (!["edges", "nodes", "episodes"].includes(scope)) {
    throw new Error("Zep scope must be edges, nodes, or episodes");
  }
  const kind: MemoryRecordKind = scopeKind[scope];
  return {
    id: options.id ?? "zep",
    provider: "zep",
    capabilities: {
      retrievalModes: ["graph"],
      recordKinds: [kind],
      readOnly: true,
      sourceLocalScores: true,
      supportsAbort: true,
      supportsFilter: false,
    },
    async recall(request): Promise<readonly MemorySourceRecord[]> {
      throwIfAborted(request.signal);
      const mapped = mappedNamespace(options.mapNamespace, request.namespace);
      const identity = "userId" in mapped
        ? { userId: requiredMappedId(mapped.userId, "Zep userId") }
        : { graphId: requiredMappedId(mapped.graphId, "Zep graphId") };
      const response = await options.client.graph.search(
        { ...identity, query: request.query, scope, limit: request.limit },
        { abortSignal: request.signal },
      );
      throwIfAborted(request.signal);
      return arrayField(response, scope).map((entry, index) => {
        const text = scope === "edges"
          ? stringField(entry, "fact", "name")
          : scope === "nodes"
            ? stringField(entry, "summary", "name") ?? textFromValue((entry as Record<string, unknown> | null)?.["attributes"])
            : stringField(entry, "content", "name");
        if (text === undefined) throw new Error(`Zep returned a ${scope} result without readable content`);
        const metadata = jsonObject(entry);
        const score = numberField(entry, "score");
        const createdAt = timestampField(entry, "createdAt", "created_at");
        return {
          sourceRecordId: sourceRecordId(entry, `${scope}-${index}`),
          kind,
          text,
          ...(score === undefined ? {} : { score }),
          ...(createdAt === undefined ? {} : { createdAt }),
          ...(metadata === undefined ? {} : { metadata }),
        };
      });
    },
  };
}
