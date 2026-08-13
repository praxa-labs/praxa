import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createMemoryRecordEnvelopeV1,
  isMemoryRecordEnvelopeV1,
  parseMemoryRecordEnvelopeV1,
} from "../packages/sdk/dist/memory/index.js";

const input = {
  apiVersion: "v1",
  providerId: "graphiti",
  sourceId: "graph-main",
  externalRecordId: "edge-123",
  revision: "rev-4",
  kind: "edge",
  subject: "person-123",
  visibility: "subject",
  content: "  Ada works at Acme.  ",
  agentId: "agent-1",
  metadata: { native_type: "EntityEdge", current: true },
  provenance: {
    origin: "inferred",
    confidence: 0.8,
    capturedAt: "2026-08-12T12:00:00Z",
    sourceUrl: "https://memory.example.test/edges/edge-123",
    evidenceIds: ["episode-9"],
    metadata: { extractor: "graphiti" },
  },
  occurredAt: "2026-08-01T09:30:00-04:00",
  observedAt: "2026-08-12T12:00:00Z",
  originChain: ["import-7"],
};

test("portable v1 envelope applies hosted defaults and round-trips without changing identity, time, or provenance", () => {
  const envelope = createMemoryRecordEnvelopeV1(input);
  assert.equal(envelope.content, "Ada works at Acme.");
  assert.deepEqual(envelope.metadata, input.metadata);
  assert.deepEqual(envelope.provenance, input.provenance);
  assert.equal(envelope.occurredAt, input.occurredAt);
  assert.equal(envelope.externalRecordId, "edge-123");
  const roundTrip = parseMemoryRecordEnvelopeV1(JSON.parse(JSON.stringify(envelope)));
  assert.deepEqual(roundTrip, envelope);
  assert.equal(isMemoryRecordEnvelopeV1(roundTrip), true);
});

test("portable v1 envelope defaults metadata and identifier arrays exactly like the hosted schema", () => {
  const value = structuredClone(input);
  delete value.metadata;
  delete value.originChain;
  delete value.provenance.metadata;
  delete value.provenance.evidenceIds;
  const envelope = parseMemoryRecordEnvelopeV1(value);
  assert.deepEqual(envelope.metadata, {});
  assert.deepEqual(envelope.provenance.metadata, {});
  assert.deepEqual(envelope.provenance.evidenceIds, []);
  assert.deepEqual(envelope.originChain, []);
});

test("portable v1 envelope rejects competing kinds, authority-like extras, unsafe provenance, and invalid time order", () => {
  for (const value of [
    { ...input, kind: "checkpoint" },
    { ...input, tenantId: "caller-chosen-tenant" },
    { ...input, provenance: { ...input.provenance, sourceUrl: "http://memory.example.test" } },
    { ...input, observedAt: "2026-07-01T00:00:00Z" },
    { ...input, visibility: "private" },
  ]) {
    assert.throws(() => parseMemoryRecordEnvelopeV1(value));
    assert.equal(isMemoryRecordEnvelopeV1(value), false);
  }
});

test("portable v1 envelope rejects calendar-invalid RFC 3339 timestamps like the hosted schema", () => {
  for (const invalidTimestamp of [
    "2026-02-30T00:00:00Z",
    "2026-08-12T24:00:00Z",
    "1900-02-29T00:00:00Z",
  ]) {
    const value = {
      ...input,
      provenance: { ...input.provenance, capturedAt: invalidTimestamp },
      occurredAt: invalidTimestamp,
      observedAt: invalidTimestamp,
    };
    assert.throws(() => parseMemoryRecordEnvelopeV1(value), /ISO timestamp with an offset/u);
    assert.equal(isMemoryRecordEnvelopeV1(value), false);
  }
  assert.doesNotThrow(() => parseMemoryRecordEnvelopeV1({
    ...input,
    provenance: { ...input.provenance, capturedAt: "2000-02-29T00:00:00Z" },
    occurredAt: "2000-02-29T00:00:00Z",
    observedAt: "2000-02-29T00:00:00Z",
  }));
  for (const hostedTimestamp of [
    "2026-08-12T12:30Z",
    "2026-08-12T12:30:59.123Z",
    "2026-08-12T12:30:00+23:59",
  ]) {
    assert.doesNotThrow(() => parseMemoryRecordEnvelopeV1({
      ...input,
      provenance: { ...input.provenance, capturedAt: hostedTimestamp },
      occurredAt: hostedTimestamp,
      observedAt: hostedTimestamp,
    }));
  }
  for (const nonHostedTimestamp of [
    "2026-08-12T12:30:00+0200",
    "2026-08-12T12:30:00+24:00",
    "2026-08-12t12:30:00Z",
  ]) {
    assert.throws(() => parseMemoryRecordEnvelopeV1({
      ...input,
      provenance: { ...input.provenance, capturedAt: nonHostedTimestamp },
      occurredAt: nonHostedTimestamp,
      observedAt: nonHostedTimestamp,
    }), /ISO timestamp with an offset/u);
  }
});

test("portable sourceUrl trimming and length checks match hosted Zod byte semantics", () => {
  const prefix = "https://memory.example.test/";
  const maximum = `${prefix}${"a".repeat(2_048 - prefix.length)}`;
  for (const [sourceUrl, expected] of [
    [" \thttps://memory.example.test/edge-123 \n", "https://memory.example.test/edge-123"],
    [`  ${maximum}\n`, maximum],
  ]) {
    const envelope = parseMemoryRecordEnvelopeV1({
      ...input,
      provenance: { ...input.provenance, sourceUrl },
    });
    assert.equal(envelope.provenance.sourceUrl, expected);
  }
  assert.throws(() => parseMemoryRecordEnvelopeV1({
    ...input,
    provenance: { ...input.provenance, sourceUrl: `${maximum}a ` },
  }), /at most 2048/u);
});
