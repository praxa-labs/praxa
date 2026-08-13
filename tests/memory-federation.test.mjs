import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";

import {
  MemoryFederation,
  MemorySourceUnavailableError,
} from "../packages/sdk/dist/memory/index.js";

const capabilities = {
  retrievalModes: ["semantic"],
  recordKinds: ["fact"],
  readOnly: true,
  sourceLocalScores: true,
  supportsAbort: true,
  supportsFilter: false,
};
const namespace = { tenantId: "tenant-1", subjectId: "subject-1" };

test("federation bounds fan-out, groups exact normalized duplicates, and preserves contradictions and source-local provenance", async () => {
  let active = 0;
  let peak = 0;
  const source = (id, records) => ({
    id,
    provider: "custom",
    capabilities,
    async recall() {
      active += 1;
      peak = Math.max(peak, active);
      await delay(8);
      active -= 1;
      return records;
    },
  });
  const federation = new MemoryFederation({
    sources: [
      source("alpha", [
        { sourceRecordId: "a1", kind: "fact", text: "User prefers dark mode", score: 0.91, provenance: { origin: "explicit", confidence: 1, capturedAt: "2026-08-01T00:00:00Z" } },
        { sourceRecordId: "a2", kind: "fact", text: "User prefers light mode", score: 0.72 },
      ]),
      source("beta", [
        { sourceRecordId: "b1", kind: "fact", text: "User  prefers\n dark mode", score: 7.4, provenance: { origin: "inferred", confidence: 0.6, capturedAt: "2026-08-02T00:00:00Z" } },
      ]),
      { id: "offline", provider: "custom", capabilities, recall: async () => { throw new MemorySourceUnavailableError("offline"); } },
    ],
    maxConcurrency: 2,
    now: () => new Date("2026-08-12T12:00:00Z"),
  });

  const result = await federation.recall({ query: "theme", namespace, limit: 10 });
  assert.equal(peak, 2);
  assert.equal(result.status, "partial");
  assert.equal(result.sources.find((entry) => entry.sourceId === "offline")?.status, "unavailable");
  assert.equal(result.deduplication.strategy, "exact_normalized_content");
  assert.equal(result.deduplication.collapsedCount, 1);
  assert.equal(result.items.length, 2, "contradictory light-mode fact remains separate");
  const grouped = result.items.find((item) => item.text.includes("dark mode"));
  assert.equal(grouped.matches.length, 2);
  assert.deepEqual(grouped.matches.map((match) => match.score?.value), [0.91, 7.4]);
  assert.ok(grouped.matches.every((match) => match.score?.semantics === "source_local"));
  assert.deepEqual(grouped.matches.map((match) => match.provenance.origin), ["explicit", "inferred"]);
  assert.equal(grouped.matches[0].provenance.sourceRecordId, "a1");
  assert.equal(grouped.ranking.method, "reciprocal_rank_fusion");
  assert.equal(grouped.ranking.contributingSources, 2);
  assert.equal(result.ranking.tieBreak, "normalized_content_codepoint");
});

test("ordinal RRF is deterministic, ignores incomparable raw scores, and uses a stable content tie break", async () => {
  const source = (id, records) => ({ id, provider: "custom", capabilities, recall: async () => records });
  const federation = new MemoryFederation({
    sources: [
      source("one", [
        { sourceRecordId: "1", kind: "fact", text: "Zulu", score: 999 },
        { sourceRecordId: "2", kind: "fact", text: "Shared", score: -100 },
      ]),
      source("two", [
        { sourceRecordId: "3", kind: "fact", text: "Alpha", score: -999 },
        { sourceRecordId: "4", kind: "fact", text: "Shared", score: 100 },
      ]),
    ],
  });
  const first = await federation.recall({ query: "q", namespace });
  const second = await federation.recall({ query: "q", namespace });
  assert.deepEqual(first.items.map((item) => item.text), ["Shared", "Alpha", "Zulu"]);
  assert.deepEqual(second.items.map((item) => item.text), first.items.map((item) => item.text));
  assert.equal(first.items[0].matches.length, 2);
  assert.ok(first.items[0].ranking.score > first.items[1].ranking.score);
  assert.equal(first.items[1].ranking.score, first.items[2].ranking.score);
});

test("federation reports timeouts and all-source failure without rejecting the aggregate", async () => {
  const never = {
    id: "slow",
    provider: "custom",
    capabilities,
    recall: ({ signal }) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true })),
  };
  const failed = { id: "failed", provider: "custom", capabilities, recall: async () => { throw new Error("boom"); } };
  const result = await new MemoryFederation({ sources: [never, failed], defaultTimeoutMs: 10 }).recall({ query: "x", namespace });
  assert.equal(result.status, "failed");
  assert.deepEqual(result.sources.map((source) => source.status).sort(), ["error", "timed_out"]);
  assert.deepEqual(result.items, []);
});

test("caller abort rejects the whole recall and constructor/request bounds fail closed", async () => {
  assert.throws(() => new MemoryFederation({ sources: [], maxConcurrency: 1 }), /sources must contain/u);
  assert.throws(() => new MemoryFederation({ sources: [{ id: "bad id", provider: "custom", capabilities, recall: async () => [] }] }), /source id/u);
  assert.throws(() => new MemoryFederation({ sources: [{ id: "bad-provider", provider: "unknown", capabilities, recall: async () => [] }] }), /unsupported provider/u);
  await assert.rejects(
    new MemoryFederation({ sources: [{ id: "valid", provider: "custom", capabilities, recall: async () => [] }] }).recall({ query: "x", namespace, mode: "bogus" }),
    /mode is unsupported/u,
  );
  const controller = new AbortController();
  const source = {
    id: "wait",
    provider: "custom",
    capabilities,
    recall: ({ signal }) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true })),
  };
  const pending = new MemoryFederation({ sources: [source], defaultTimeoutMs: 1_000 }).recall({ query: "x", namespace, signal: controller.signal });
  controller.abort(new Error("caller stopped"));
  await assert.rejects(pending, /caller stopped/u);
});

test("provenance URLs, identifier arrays, and metadata fail closed at public bounds", async () => {
  const source = (record) => ({ id: "bounded", provider: "custom", capabilities, recall: async () => [record] });
  const badUrl = await new MemoryFederation({ sources: [source({ sourceRecordId: "x", kind: "fact", text: "x", provenance: { origin: "explicit", confidence: 1, capturedAt: "2026-08-01T00:00:00Z", sourceUrl: "http://example.test" } })] }).recall({ query: "x", namespace });
  assert.equal(badUrl.status, "failed");
  assert.match(badUrl.sources[0].error.message, /sourceUrl must be HTTPS/u);
  const tooManyEvidenceIds = await new MemoryFederation({ sources: [source({ sourceRecordId: "x", kind: "fact", text: "x", provenance: { origin: "explicit", confidence: 1, capturedAt: "2026-08-01T00:00:00Z", evidenceIds: Array.from({ length: 17 }, (_, index) => `e${index}`) } })] }).recall({ query: "x", namespace });
  assert.equal(tooManyEvidenceIds.status, "failed");
  assert.match(tooManyEvidenceIds.sources[0].error.message, /evidenceIds/u);
  const paddedUrl = await new MemoryFederation({ sources: [source({
    sourceRecordId: "trimmed",
    kind: "fact",
    text: "x",
    provenance: {
      origin: "explicit",
      confidence: 1,
      capturedAt: "2026-08-01T00:00:00Z",
      sourceUrl: " \thttps://example.test/memory/trimmed \n",
    },
  })] }).recall({ query: "x", namespace });
  assert.equal(paddedUrl.status, "ok");
  assert.equal(paddedUrl.items[0].matches[0].provenance.sourceUrl, "https://example.test/memory/trimmed");
  const result = await new MemoryFederation({ sources: [source({ sourceRecordId: "x", kind: "fact", text: "x" })], now: () => new Date("2026-08-12T12:00:00Z") }).recall({ query: "x", namespace });
  assert.equal(result.items[0].matches[0].provenance.capturedAt, "2026-08-12T12:00:00.000Z");
  assert.equal(result.items[0].matches[0].provenance.origin, "observed");
  assert.equal(result.items[0].matches[0].provenance.confidence, 1);
});

test("partial source provenance is rejected instead of receiving required-field defaults", async () => {
  for (const provenance of [
    {},
    { origin: "explicit" },
    { origin: "explicit", confidence: 1 },
    { origin: "explicit", capturedAt: "2026-08-01T00:00:00Z" },
    null,
  ]) {
    const source = {
      id: "partial",
      provider: "custom",
      capabilities,
      recall: async () => [{ sourceRecordId: "x", kind: "fact", text: "x", provenance }],
    };
    const result = await new MemoryFederation({ sources: [source] }).recall({ query: "x", namespace });
    assert.equal(result.status, "failed");
    assert.match(result.sources[0].error.message, /complete provenance.*origin.*confidence.*capturedAt/u);
    assert.deepEqual(result.items, []);
  }
});

test("JavaScript sources cannot emit provenance origins outside the public enum", async () => {
  const source = {
    id: "untrusted",
    provider: "custom",
    capabilities,
    recall: async () => [{
      sourceRecordId: "x",
      kind: "fact",
      text: "x",
      provenance: {
        origin: "fabricated",
        confidence: 1,
        capturedAt: "2026-08-01T00:00:00Z",
      },
    }],
  };
  const result = await new MemoryFederation({ sources: [source] }).recall({ query: "x", namespace });
  assert.equal(result.status, "failed");
  assert.match(result.sources[0].error.message, /provenance origin/u);
  assert.deepEqual(result.items, []);
});
