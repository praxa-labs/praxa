import type { MemoryNamespace, MemorySource, MemorySourceRecord } from "../contracts.js";
import { jsonObject, mappedNamespace, requiredMappedId, sourceRecordId, stringField, textFromValue, throwIfAborted, timestampField } from "../adapter-utils.js";

export type LettaRequestOptions = Readonly<{ signal?: AbortSignal }>;

export interface LettaReadClient {
  agents: Readonly<{
    blocks: Readonly<{ retrieve(label: string, options: Readonly<{ agent_id: string }>, requestOptions?: LettaRequestOptions): Promise<unknown> }>;
    messages: Readonly<{ list(agentId: string, options: Readonly<{ limit: number; order?: "asc" | "desc" }>, requestOptions?: LettaRequestOptions): Promise<unknown> }>;
  }>;
}

export type LettaMemorySourceOptions = Readonly<{
  id?: string;
  client: LettaReadClient;
  mapNamespace: (namespace: MemoryNamespace) => Readonly<{ agentId: string; blockLabels?: readonly string[] }>;
  include?: "blocks" | "messages" | "both";
}>;

function pageItems(value: unknown): readonly unknown[] {
  if (Array.isArray(value)) return value;
  const record = value !== null && typeof value === "object" ? value as Record<string, unknown> : undefined;
  for (const key of ["data", "items", "messages"]) if (Array.isArray(record?.[key])) return record[key] as readonly unknown[];
  throw new Error("Letta read returned an unsupported page shape");
}

export function createLettaMemorySource(options: LettaMemorySourceOptions): MemorySource {
  const include = options.include ?? "both";
  if (!["blocks", "messages", "both"].includes(include)) {
    throw new Error("Letta include must be blocks, messages, or both");
  }
  const recordKinds = include === "blocks" ? ["pinned_context"] as const : include === "messages" ? ["message"] as const : ["pinned_context", "message"] as const;
  return {
    id: options.id ?? "letta",
    provider: "letta",
    capabilities: {
      retrievalModes: ["recent"],
      recordKinds,
      readOnly: true,
      sourceLocalScores: true,
      supportsAbort: true,
      supportsFilter: false,
    },
    async recall(request): Promise<readonly MemorySourceRecord[]> {
      throwIfAborted(request.signal);
      const mapped = mappedNamespace(options.mapNamespace, request.namespace);
      const agentId = requiredMappedId(mapped.agentId, "Letta agentId");
      const labels = [...(mapped.blockLabels ?? [])];
      if (labels.length > 16 || labels.some((label) => label.trim().length === 0 || label.length > 128)) {
        throw new Error("Letta blockLabels mapping must contain at most 16 bounded labels");
      }
      const records: MemorySourceRecord[] = [];
      if (include !== "messages") {
        for (const label of labels.slice(0, request.limit)) {
          throwIfAborted(request.signal);
          const block = await options.client.agents.blocks.retrieve(label, { agent_id: agentId }, { signal: request.signal });
          throwIfAborted(request.signal);
          const text = stringField(block, "value");
          if (text === undefined) throw new Error(`Letta block ${label} has no value`);
          const metadata = jsonObject(block);
          records.push({ sourceRecordId: sourceRecordId(block, `block-${label}`), kind: "pinned_context", text, ...(metadata === undefined ? {} : { metadata }) });
        }
      }
      if (include !== "blocks" && records.length < request.limit) {
        throwIfAborted(request.signal);
        const page = await options.client.agents.messages.list(
          agentId,
          { limit: request.limit - records.length, order: "desc" },
          { signal: request.signal },
        );
        throwIfAborted(request.signal);
        for (const [index, message] of pageItems(page).entries()) {
          const text = textFromValue((message as Record<string, unknown> | null)?.["content"])
            ?? stringField(message, "reasoning", "message");
          if (text === undefined) continue;
          const metadata = jsonObject(message);
          const createdAt = timestampField(message, "date", "createdAt", "created_at");
          records.push({
            sourceRecordId: sourceRecordId(message, `message-${index}`),
            kind: "message",
            text,
            ...(createdAt === undefined ? {} : { createdAt }),
            ...(metadata === undefined ? {} : { metadata }),
          });
        }
      }
      throwIfAborted(request.signal);
      return records.slice(0, request.limit);
    },
  };
}
