import type { MemoryNamespace, MemorySource, MemorySourceRecord } from "../contracts.js";
import { jsonObject, mappedNamespace, object, sourceRecordId, textFromValue, throwIfAborted } from "../adapter-utils.js";

export interface OpenAIAgentsSessionLike {
  getItems(limit?: number): Promise<readonly unknown[]>;
}

export type OpenAIAgentsSessionSourceOptions = Readonly<{
  id?: string;
  sessionForNamespace: (namespace: MemoryNamespace) => OpenAIAgentsSessionLike;
  text?: (item: unknown) => string;
  itemId?: (item: unknown, index: number) => string;
}>;

function isMessageItem(value: unknown): boolean {
  const item = object(value);
  if (item === undefined) return false;
  if (item["type"] === "message") return true;
  return item["type"] === undefined && ["user", "assistant", "system"].includes(String(item["role"]));
}

export function createOpenAIAgentsSessionSource(options: OpenAIAgentsSessionSourceOptions): MemorySource {
  return {
    id: options.id ?? "openai_agents",
    provider: "openai_agents",
    capabilities: {
      retrievalModes: ["recent"],
      recordKinds: ["message"],
      readOnly: true,
      sourceLocalScores: true,
      supportsAbort: false,
      supportsFilter: false,
    },
    async recall(request): Promise<readonly MemorySourceRecord[]> {
      throwIfAborted(request.signal);
      const session = mappedNamespace(options.sessionForNamespace, request.namespace);
      if (typeof session.getItems !== "function") throw new Error("OpenAI Agents namespace mapping returned no Session.getItems");
      const items = await session.getItems(request.limit);
      throwIfAborted(request.signal);
      if (!Array.isArray(items)) throw new Error("OpenAI Agents Session.getItems returned a non-array result");
      return items
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => isMessageItem(item))
        .reverse()
        .flatMap(({ item, index }) => {
          const text = options.text?.(item) ?? textFromValue((item as Record<string, unknown> | null)?.["content"] ?? item);
          if (text === undefined || text.trim().length === 0) return [];
          const metadata = jsonObject(item);
          return [{
            sourceRecordId: options.itemId?.(item, index) ?? sourceRecordId(item, `item-${index}`),
            kind: "message",
            text,
            ...(metadata === undefined ? {} : { metadata }),
          }];
        });
    },
  };
}
