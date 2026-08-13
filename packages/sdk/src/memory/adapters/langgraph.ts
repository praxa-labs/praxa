import type { MemoryJsonObject, MemoryNamespace, MemorySource, MemorySourceRecord } from "../contracts.js";
import { jsonObject, mappedNamespace, numberField, sourceRecordId, textFromValue, throwIfAborted, timestampField } from "../adapter-utils.js";

export interface LangGraphBaseStoreLike {
  search(
    namespacePrefix: readonly string[],
    options?: Readonly<{ filter?: MemoryJsonObject; limit?: number; offset?: number; query?: string }>,
  ): Promise<readonly unknown[]>;
}

export type LangGraphMemorySourceOptions = Readonly<{
  id?: string;
  store: LangGraphBaseStoreLike;
  mapNamespace: (namespace: MemoryNamespace) => readonly string[];
  kind?: "document" | "summary" | "pinned_context";
  text?: (value: unknown, item: unknown) => string;
}>;

export function createLangGraphMemorySource(options: LangGraphMemorySourceOptions): MemorySource {
  const kind = options.kind ?? "document";
  if (!["document", "summary", "pinned_context"].includes(kind)) {
    throw new Error("LangGraph kind must be document, summary, or pinned_context");
  }
  return {
    id: options.id ?? "langgraph",
    provider: "langgraph",
    capabilities: {
      retrievalModes: ["semantic"],
      recordKinds: [kind],
      readOnly: true,
      sourceLocalScores: true,
      supportsAbort: false,
      supportsFilter: true,
    },
    async recall(request): Promise<readonly MemorySourceRecord[]> {
      throwIfAborted(request.signal);
      const namespace = [...mappedNamespace(options.mapNamespace, request.namespace)];
      if (namespace.length === 0 || namespace.length > 16 || namespace.some((segment) => segment.trim().length === 0 || segment.length > 256)) {
        throw new Error("LangGraph namespace mapping must return 1-16 bounded segments");
      }
      const results = await options.store.search(namespace, {
        query: request.query,
        limit: request.limit,
        ...(request.filter === undefined ? {} : { filter: request.filter }),
      });
      throwIfAborted(request.signal);
      if (!Array.isArray(results)) throw new Error("LangGraph BaseStore search returned a non-array result");
      return results.map((item, index) => {
        const value = (item as Record<string, unknown> | null)?.["value"];
        const text = options.text?.(value, item) ?? textFromValue(value);
        if (text === undefined || text.trim().length === 0) throw new Error("LangGraph item has no readable value");
        const metadata = jsonObject(value);
        const score = numberField(item, "score");
        const createdAt = timestampField(item, "createdAt", "created_at");
        const updatedAt = timestampField(item, "updatedAt", "updated_at");
        return {
          sourceRecordId: sourceRecordId(item, `item-${index}`),
          kind,
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
