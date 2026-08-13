import {
  MEMORY_FEDERATION_SCHEMA_VERSION,
  MemorySourceUnavailableError,
  MemorySourceUnsupportedError,
  type MemoryFederationOptions,
  type MemoryFederationResult,
  type MemoryRecallItem,
  type MemoryRecallRequest,
  type MemoryRetrievalMode,
  type MemorySource,
  type MemorySourceResult,
} from "./contracts.js";
import {
  abortReason,
  assertBoundedInteger,
  assertJsonObject,
  assertRetrievalMode,
  assertSource,
  boundedError,
  normalizeNamespace,
  normalizeQuery,
  normalizeSourceRecord,
} from "./normalize.js";

const HARD_MAX_SOURCES = 32;
const HARD_MAX_CONCURRENCY = 8;
const HARD_MAX_RESULTS_PER_SOURCE = 100;
const HARD_MAX_TOTAL_RESULTS = 500;
const HARD_MAX_TIMEOUT_MS = 60_000;

type InternalResult = Readonly<{ summary: MemorySourceResult; items: readonly MemoryRecallItem[] }>;

class MemorySourceTimeoutError extends Error {
  readonly code = "source_timed_out" as const;

  constructor(sourceId: string, timeoutMs: number) {
    super(`Memory source ${sourceId} exceeded ${timeoutMs}ms`);
    this.name = "MemorySourceTimeoutError";
  }
}

function preferredMode(source: MemorySource, requested: MemoryRetrievalMode | undefined): MemoryRetrievalMode {
  return requested ?? source.capabilities.retrievalModes[0] ?? "exact";
}

function normalizedContentKey(item: MemoryRecallItem): string {
  return `${item.kind}\u0000${item.text.normalize("NFKC").replace(/\s+/gu, " ").trim()}`;
}

function interleaveAndDeduplicate(
  results: readonly InternalResult[],
  limit: number,
): Readonly<{ items: readonly MemoryRecallItem[]; collapsedCount: number }> {
  const groups = new Map<string, { item: MemoryRecallItem; bestRankBySource: Map<string, number> }>();
  let rawCount = 0;
  for (const result of results) {
    for (const item of result.items) {
      rawCount += 1;
      const key = normalizedContentKey(item);
      const existing = groups.get(key);
      if (existing === undefined) {
        groups.set(key, { item, bestRankBySource: new Map(item.matches.map((match) => [match.sourceId, match.sourceRank])) });
      } else {
        for (const match of item.matches) {
          const current = existing.bestRankBySource.get(match.sourceId);
          if (current === undefined || match.sourceRank < current) existing.bestRankBySource.set(match.sourceId, match.sourceRank);
        }
        existing.item = { ...existing.item, matches: [...existing.item.matches, ...item.matches] };
      }
    }
  }
  const ranked = [...groups.entries()].map(([key, group]) => ({
    key,
    item: group.item,
    score: [...group.bestRankBySource.values()].reduce((sum, rank) => sum + 1 / (60 + rank), 0),
    contributingSources: group.bestRankBySource.size,
  })).sort((left, right) => right.score - left.score || (left.key < right.key ? -1 : left.key > right.key ? 1 : 0));
  return {
    items: ranked.slice(0, limit).map((group, index) => ({
      ...group.item,
      ranking: {
        method: "reciprocal_rank_fusion",
        score: group.score,
        rank: index + 1,
        rankConstant: 60,
        contributingSources: group.contributingSources,
      },
    })),
    collapsedCount: rawCount - groups.size,
  };
}

export class MemoryFederation {
  readonly #sources: readonly MemorySource[];
  readonly #maxConcurrency: number;
  readonly #maxResultsPerSource: number;
  readonly #maxTotalResults: number;
  readonly #defaultTimeoutMs: number;
  readonly #now: () => Date;

  constructor(options: MemoryFederationOptions) {
    const maxSources = assertBoundedInteger(options.maxSources ?? 16, "maxSources", 1, HARD_MAX_SOURCES);
    if (options.sources.length === 0 || options.sources.length > maxSources) {
      throw new RangeError(`sources must contain 1-${maxSources} entries`);
    }
    const ids = new Set<string>();
    for (const source of options.sources) {
      assertSource(source);
      if (ids.has(source.id)) throw new Error(`Duplicate memory source id: ${source.id}`);
      ids.add(source.id);
    }
    this.#sources = [...options.sources];
    this.#maxConcurrency = assertBoundedInteger(options.maxConcurrency ?? 4, "maxConcurrency", 1, HARD_MAX_CONCURRENCY);
    this.#maxResultsPerSource = assertBoundedInteger(options.maxResultsPerSource ?? 50, "maxResultsPerSource", 1, HARD_MAX_RESULTS_PER_SOURCE);
    this.#maxTotalResults = assertBoundedInteger(options.maxTotalResults ?? 100, "maxTotalResults", 1, HARD_MAX_TOTAL_RESULTS);
    this.#defaultTimeoutMs = assertBoundedInteger(options.defaultTimeoutMs ?? 5_000, "defaultTimeoutMs", 1, HARD_MAX_TIMEOUT_MS);
    this.#now = options.now ?? (() => new Date());
  }

  async recall(request: MemoryRecallRequest): Promise<MemoryFederationResult> {
    if (request.signal?.aborted === true) throw abortReason(request.signal);
    const query = normalizeQuery(request.query);
    const namespace = normalizeNamespace(request.namespace);
    assertRetrievalMode(request.mode);
    assertJsonObject(request.filter, "filter");
    const limit = assertBoundedInteger(request.limit ?? 10, "limit", 1, this.#maxTotalResults);
    const timeoutMs = assertBoundedInteger(request.timeoutMs ?? this.#defaultTimeoutMs, "timeoutMs", 1, HARD_MAX_TIMEOUT_MS);
    const selected = this.#selectedSources(request.sourceIds);
    const startedAt = this.#now().toISOString();
    const results: InternalResult[] = new Array(selected.length);
    let next = 0;
    const worker = async (): Promise<void> => {
      while (true) {
        const index = next;
        next += 1;
        const source = selected[index];
        if (source === undefined) return;
        results[index] = await this.#recallSource(source, {
          query,
          namespace,
          limit: Math.min(limit, this.#maxResultsPerSource),
          ...(request.mode === undefined ? {} : { mode: request.mode }),
          ...(request.filter === undefined ? {} : { filter: request.filter }),
        }, timeoutMs, request.signal);
      }
    };
    await Promise.all(Array.from({ length: Math.min(this.#maxConcurrency, selected.length) }, worker));
    const finalSignal = request.signal;
    if (finalSignal?.aborted === true) throw abortReason(finalSignal);
    const successful = results.filter((result) => result.summary.status === "ok").length;
    const deduplicated = interleaveAndDeduplicate(results, limit);
    return {
      schemaVersion: MEMORY_FEDERATION_SCHEMA_VERSION,
      status: successful === results.length ? "ok" : successful === 0 ? "failed" : "partial",
      namespace,
      query,
      items: deduplicated.items,
      sources: results.map((result) => result.summary),
      deduplication: { strategy: "exact_normalized_content", collapsedCount: deduplicated.collapsedCount },
      ranking: { method: "reciprocal_rank_fusion", rankConstant: 60, tieBreak: "normalized_content_codepoint" },
      startedAt,
      completedAt: this.#now().toISOString(),
    };
  }

  #selectedSources(sourceIds: readonly string[] | undefined): readonly MemorySource[] {
    if (sourceIds === undefined) return this.#sources;
    if (sourceIds.length === 0 || sourceIds.length > this.#sources.length) {
      throw new Error("sourceIds must select at least one configured source without duplicates");
    }
    const requested = new Set(sourceIds);
    if (requested.size !== sourceIds.length) throw new Error("sourceIds must not contain duplicates");
    const selected = this.#sources.filter((source) => requested.has(source.id));
    if (selected.length !== requested.size) {
      const known = new Set(this.#sources.map((source) => source.id));
      const unknown = sourceIds.find((id) => !known.has(id));
      throw new Error(`Unknown memory source id: ${unknown ?? "unknown"}`);
    }
    return selected;
  }

  async #recallSource(
    source: MemorySource,
    request: Omit<Parameters<MemorySource["recall"]>[0], "signal">,
    timeoutMs: number,
    parentSignal: AbortSignal | undefined,
  ): Promise<InternalResult> {
    const started = Date.now();
    const mode = preferredMode(source, request.mode);
    const base = { sourceId: source.id, provider: source.provider, retrievalMode: mode } as const;
    if (request.mode !== undefined && !source.capabilities.retrievalModes.includes(request.mode)) {
      const error = new MemorySourceUnsupportedError(`Memory source ${source.id} does not support ${request.mode} retrieval`);
      return { summary: { ...base, status: "unsupported", durationMs: 0, itemCount: 0, duplicateCount: 0, truncated: false, error: boundedError(error) }, items: [] };
    }
    if (request.filter !== undefined && !source.capabilities.supportsFilter) {
      const error = new MemorySourceUnsupportedError(`Memory source ${source.id} does not support filters`);
      return { summary: { ...base, status: "unsupported", durationMs: 0, itemCount: 0, duplicateCount: 0, truncated: false, error: boundedError(error) }, items: [] };
    }
    const controller = new AbortController();
    let rejectParentAbort: ((reason: unknown) => void) | undefined;
    const parentAbort = new Promise<never>((_resolve, reject) => { rejectParentAbort = reject; });
    const onAbort = (): void => {
      const error = parentSignal === undefined ? new Error("Memory recall aborted") : abortReason(parentSignal);
      controller.abort(error);
      rejectParentAbort?.(error);
    };
    if (parentSignal?.aborted === true) onAbort();
    else parentSignal?.addEventListener("abort", onAbort, { once: true });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          const error = new MemorySourceTimeoutError(source.id, timeoutMs);
          controller.abort(error);
          reject(error);
        }, timeoutMs);
      });
      const records = await Promise.race([
        Promise.resolve().then(() => source.recall({ ...request, signal: controller.signal })),
        timeout,
        parentAbort,
      ]);
      if (parentSignal?.aborted === true) throw abortReason(parentSignal);
      if (!Array.isArray(records)) throw new Error(`Memory source ${source.id} returned a non-array result`);
      const truncated = records.length > this.#maxResultsPerSource;
      const items: MemoryRecallItem[] = [];
      const seen = new Set<string>();
      let duplicateCount = 0;
      const retrievedAt = this.#now().toISOString();
      for (const [index, record] of records.slice(0, this.#maxResultsPerSource).entries()) {
        const item = normalizeSourceRecord(source, record, request.namespace, mode, retrievedAt, index + 1);
        if (seen.has(item.id)) {
          duplicateCount += 1;
          continue;
        }
        seen.add(item.id);
        items.push(item);
      }
      return {
        summary: { ...base, status: "ok", durationMs: Date.now() - started, itemCount: items.length, duplicateCount, truncated },
        items,
      };
    } catch (error) {
      if (parentSignal?.aborted === true) throw abortReason(parentSignal);
      const status = error instanceof MemorySourceTimeoutError
        ? "timed_out"
        : error instanceof MemorySourceUnavailableError
          ? "unavailable"
          : error instanceof MemorySourceUnsupportedError
            ? "unsupported"
            : "error";
      return {
        summary: { ...base, status, durationMs: Date.now() - started, itemCount: 0, duplicateCount: 0, truncated: false, error: boundedError(error) },
        items: [],
      };
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      parentSignal?.removeEventListener("abort", onAbort);
    }
  }
}
