import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

import {
  MemoryFederation,
  createGraphitiMemorySource,
  createLangGraphMemorySource,
  createLettaMemorySource,
  createMem0MemorySource,
  createOpenAIAgentsSessionSource,
  createZepMemorySource,
} from "../packages/sdk/dist/memory/index.js";

const namespace = { tenantId: "tenant-a", subjectId: "subject-a" };
const request = { query: "preference", namespace, limit: 5, signal: new AbortController().signal };
const repository = path.resolve(new URL("..", import.meta.url).pathname);

test("Mem0 adapter injects a caller-mapped entity filter and normalizes hybrid results", async () => {
  let invocation;
  const source = createMem0MemorySource({
    client: { search: async (...arguments_) => { invocation = arguments_; return { results: [{
      id: "m1",
      memory: "Likes tea",
      score: 0.8,
      createdAt: "2026-08-01T00:00:00Z",
      updatedAt: "2026-08-02T00:00:00Z",
    }] }; } },
    mapNamespace: (value) => ({ userId: value.subjectId }),
  });
  const records = await source.recall(request);
  assert.deepEqual(invocation, ["preference", { filters: { userId: "subject-a" }, topK: 5 }]);
  assert.deepEqual(records[0], {
    sourceRecordId: "m1",
    kind: "fact",
    text: "Likes tea",
    score: 0.8,
    createdAt: "2026-08-01T00:00:00Z",
    updatedAt: "2026-08-02T00:00:00Z",
  });
  assert.deepEqual(source.capabilities.retrievalModes, ["hybrid"]);
  for (const key of ["userId", "agentId", "appId", "runId"]) {
    await assert.doesNotReject(
      createMem0MemorySource({ client: { search: async () => ({ results: [] }) }, mapNamespace: () => ({ [key]: "scope-a" }) }).recall(request),
    );
  }
  for (const unsafeNamespace of [
    { tenant: "x" },
    { user_id: "victim" },
    { agent_id: "victim" },
    { NOT: [{ userId: "victim" }] },
    { userId: { ne: "victim" } },
    { userId: "*" },
    { AND: [{ userId: "victim" }] },
  ]) {
    await assert.rejects(
      createMem0MemorySource({ client: { search: async () => ({ results: [] }) }, mapNamespace: () => unsafeNamespace }).recall(request),
      /camelCase positive equality/u,
    );
  }
});

test("Zep and injected Graphiti adapters expose graph reads without creating a network client", async () => {
  let zepInvocation;
  const zep = createZepMemorySource({
    client: { graph: { search: async (...arguments_) => { zepInvocation = arguments_; return { edges: [{ uuid: "z1", fact: "Lives in Paris", score: 0.4 }] }; } } },
    mapNamespace: (value) => ({ userId: value.subjectId }),
  });
  assert.equal((await zep.recall({ ...request, mode: "graph" }))[0].kind, "edge");
  assert.deepEqual(zepInvocation[0], { userId: "subject-a", query: "preference", scope: "edges", limit: 5 });
  assert.equal(zepInvocation[1].abortSignal, request.signal);
  assert.deepEqual(zep.capabilities.retrievalModes, ["graph"]);
  assert.equal(zep.capabilities.supportsAbort, true);

  let graphitiInput;
  const graphiti = createGraphitiMemorySource({
    transport: { search: async (input) => { graphitiInput = input; return [{ sourceRecordId: "g1", kind: "entity", text: "Ada" }]; } },
    mapNamespace: (value) => ({ groupId: `${value.tenantId}:${value.subjectId}` }),
  });
  assert.equal((await graphiti.recall({ ...request, mode: "graph" }))[0].kind, "entity");
  assert.deepEqual(graphitiInput.namespace, { groupId: "tenant-a:subject-a" });
  assert.equal(graphitiInput.mode, "graph");
  assert.deepEqual(graphiti.capabilities.retrievalModes, ["graph"]);
  assert.equal(graphiti.capabilities.supportsAbort, false);
  const abortAwareGraphiti = createGraphitiMemorySource({
    transport: { search: async () => [] },
    mapNamespace: () => ({ groupId: "group-a" }),
    supportsAbort: true,
  });
  assert.equal(abortAwareGraphiti.capabilities.supportsAbort, true);

  const declaredInvocations = [];
  const declaredGraphiti = createGraphitiMemorySource({
    transport: { search: async (input) => { declaredInvocations.push(input.mode); return []; } },
    mapNamespace: () => ({ groupId: "group-a" }),
    retrievalModes: ["semantic", "hybrid"],
  });
  assert.deepEqual(declaredGraphiti.capabilities.retrievalModes, ["semantic", "hybrid"]);
  await declaredGraphiti.recall({ ...request, mode: "hybrid" });
  await declaredGraphiti.recall({ ...request, mode: undefined });
  assert.deepEqual(declaredInvocations, ["hybrid", "semantic"]);
  await assert.rejects(declaredGraphiti.recall({ ...request, mode: "graph" }), /does not support graph retrieval/u);
  assert.deepEqual(declaredInvocations, ["hybrid", "semantic"], "undeclared mode never reaches the transport");
  const refused = await new MemoryFederation({ sources: [declaredGraphiti] }).recall({ query: "x", namespace, mode: "graph" });
  assert.equal(refused.sources[0].status, "unsupported");
  for (const retrievalModes of [[], ["graph", "graph"], ["recent"]]) {
    assert.throws(() => createGraphitiMemorySource({
      transport: { search: async () => [] },
      mapNamespace: () => ({ groupId: "group-a" }),
      retrievalModes,
    }), /Graphiti retrievalModes/u);
  }
});

test("LangGraph adapter reads only long-term BaseStore items and preserves checkpoint exclusion", async () => {
  let invocation;
  const source = createLangGraphMemorySource({
    store: { search: async (...arguments_) => { invocation = arguments_; return [{
      key: "l1",
      value: { text: "Long-term preference" },
      score: 0.7,
      createdAt: new Date("2026-08-01T00:00:00Z"),
      updatedAt: new Date("2026-08-02T00:00:00Z"),
    }]; } },
    mapNamespace: (value) => [value.tenantId, value.subjectId, "memory"],
  });
  const records = await source.recall({ ...request, mode: "semantic" });
  assert.equal(records[0].kind, "document");
  assert.equal(records[0].createdAt, "2026-08-01T00:00:00.000Z");
  assert.equal(records[0].updatedAt, "2026-08-02T00:00:00.000Z");
  assert.deepEqual(invocation, [["tenant-a", "subject-a", "memory"], { query: "preference", limit: 5 }]);
  assert.deepEqual(source.capabilities.retrievalModes, ["semantic"]);
  assert.doesNotMatch(JSON.stringify(source.capabilities.recordKinds), /checkpoint/u);
});

test("Letta blocks map to pinned context, Letta history to messages, and OpenAI Session.getItems to messages", async () => {
  const lettaRequestSignals = [];
  const letta = createLettaMemorySource({
    client: {
      agents: {
        blocks: { retrieve: async (label, _parameters, options) => { lettaRequestSignals.push(options.signal); return { id: `block-${label}`, value: "Pinned profile" }; } },
        messages: { list: async (_agentId, _parameters, options) => { lettaRequestSignals.push(options.signal); return [{ id: "msg-1", content: "Recent turn", date: "2026-08-01T00:00:00Z" }]; } },
      },
    },
    mapNamespace: () => ({ agentId: "agent-1", blockLabels: ["human"] }),
  });
  assert.deepEqual((await letta.recall({ ...request, mode: "recent" })).map((record) => record.kind), ["pinned_context", "message"]);
  assert.deepEqual(letta.capabilities.retrievalModes, ["recent"]);
  assert.equal(letta.capabilities.supportsAbort, true);
  assert.deepEqual(lettaRequestSignals, [request.signal, request.signal]);

  let limit;
  const openai = createOpenAIAgentsSessionSource({
    sessionForNamespace: () => ({ getItems: async (value) => { limit = value; return [
      { id: "old", type: "message", role: "user", content: [{ type: "input_text", text: "Old turn" }] },
      { id: "tool", type: "function_call", callId: "call-1", name: "lookup", arguments: "{}" },
      { id: "compact", type: "compaction", encrypted_content: "ciphertext" },
      { id: "new", type: "message", role: "assistant", content: [{ type: "output_text", text: "New turn" }] },
    ]; } }),
  });
  const records = await openai.recall({ ...request, mode: "recent" });
  assert.equal(limit, 5);
  assert.deepEqual(records.map(({ sourceRecordId, kind, text }) => ({ sourceRecordId, kind, text })), [
    { sourceRecordId: "new", kind: "message", text: "New turn" },
    { sourceRecordId: "old", kind: "message", text: "Old turn" },
  ]);
  assert.doesNotMatch(JSON.stringify(records), /ciphertext|function_call/u);
  const federated = await new MemoryFederation({ sources: [openai] }).recall({ query: "unused", namespace, mode: "recent", limit: 5 });
  assert.deepEqual(federated.items.map((item) => item.text), ["New turn", "Old turn"]);
});

test("Letta abort stops subsequent reads after an in-flight request settles", async () => {
  const calls = [];
  let releaseFirst;
  const source = createLettaMemorySource({
    client: {
      agents: {
        blocks: { retrieve: async (label) => {
          calls.push(label);
          if (label === "one") await new Promise((resolve) => { releaseFirst = resolve; });
          return { id: label, value: label };
        } },
        messages: { list: async () => { calls.push("messages"); return []; } },
      },
    },
    mapNamespace: () => ({ agentId: "agent-1", blockLabels: ["one", "two", "three"] }),
  });
  const controller = new AbortController();
  const pending = source.recall({ ...request, signal: controller.signal });
  await Promise.resolve();
  controller.abort(new Error("stopped"));
  releaseFirst();
  await assert.rejects(pending, /stopped/u);
  assert.deepEqual(calls, ["one"]);
});

test("adapter factories reject JavaScript values outside provider-specific option vocabularies", () => {
  const graphitiOptions = {
    transport: { search: async () => [] },
    mapNamespace: () => ({ groupId: "group-a" }),
  };
  for (const recordKinds of [[], ["message"], ["fact", "fact"]]) {
    assert.throws(
      () => createGraphitiMemorySource({ ...graphitiOptions, recordKinds }),
      /Graphiti recordKinds/u,
    );
  }
  assert.throws(
    () => createGraphitiMemorySource({ ...graphitiOptions, supportsAbort: "yes" }),
    /Graphiti supportsAbort/u,
  );
  assert.throws(
    () => createLangGraphMemorySource({ store: { search: async () => [] }, mapNamespace: () => ["memory"], kind: "message" }),
    /LangGraph kind/u,
  );
  assert.throws(
    () => createLettaMemorySource({ client: { agents: { blocks: { retrieve: async () => ({}) }, messages: { list: async () => [] } } }, mapNamespace: () => ({ agentId: "agent-1" }), include: "archival" }),
    /Letta include/u,
  );
  assert.throws(
    () => createZepMemorySource({ client: { graph: { search: async () => ({}) } }, mapNamespace: () => ({ userId: "user-1" }), scope: "facts" }),
    /Zep scope/u,
  );
  assert.throws(
    () => createMem0MemorySource({ client: { search: async () => ({ results: [] }) }, mapNamespace: () => ({ userId: "user-1" }), rerank: "true" }),
    /Mem0 rerank/u,
  );
});

test("official Zep graph search signature is structurally accepted under strict TypeScript", async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), "praxa-zep-types-"));
  try {
    const fixture = path.join(temporary, "zep.ts");
    const sdk = path.join(repository, "packages/sdk/dist/memory/index.js");
    await writeFile(fixture, `
      import { createZepMemorySource } from ${JSON.stringify(sdk)};
      interface GraphSearchQuery {
        query: string;
        userId?: string;
        graphId?: string;
        scope?: "edges" | "nodes" | "episodes";
        limit?: number;
      }
      interface OfficialZepClient {
        graph: {
          search(input: GraphSearchQuery, options?: { abortSignal?: AbortSignal }): Promise<unknown>;
        };
      }
      declare const client: OfficialZepClient;
      createZepMemorySource({ client, mapNamespace: ({ subjectId }) => ({ userId: subjectId }) });
    `, "utf8");
    const compiled = spawnSync(path.join(repository, "node_modules/.bin/tsc"), [
      "--ignoreConfig", "--strict", "--noEmit", "--skipLibCheck", "--module", "NodeNext", "--moduleResolution", "NodeNext", "--target", "ES2022", fixture,
    ], { cwd: repository, encoding: "utf8" });
    assert.equal(compiled.status, 0, compiled.stdout || compiled.stderr);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
