# Memory federation

`@praxa/sdk/memory` is a dependency-free, read-only federation layer for
caller-owned memory clients. Version 0.3.0 is source/package functionality; it
does not imply that a Praxa-hosted memory backend exists or is deployed. The
legacy OpenAPI 8.1 `/v8/memory/query` route and all 12 MCP tools are unchanged.

## Portable interchange envelope

`MemoryRecordEnvelopeV1` is the provider-neutral import/export record shared
with the hosted `/v1/memory` contract. Use `createMemoryRecordEnvelopeV1` for
typed inputs or `parseMemoryRecordEnvelopeV1` at an untrusted JSON boundary.
The validator is strict, dependency-free, defaults absent metadata,
`evidenceIds`, and `originChain` to empty values, and preserves source ID,
external record ID, revision, original/observed times, provenance origin and
confidence, evidence references, and optional expiry. Timestamp acceptance is
the same calendar-valid RFC 3339 grammar as the hosted
`PublicTimestampSchema`; invalid dates are rejected instead of normalized.

The envelope's `subject`, agent, thread, workspace, and purpose fields are
labels inside a server-derived tenant boundary; `visibility: "subject"` does
not confer tenant or write authority. The helper performs no network call,
upload, or export by itself.

## Contract

Every recall requires a non-empty query and explicit `{ tenantId, subjectId,
scope? }` namespace. Adapters cannot infer a tenant from process state. A
caller-provided mapper converts that namespace to provider-native user, graph,
group, agent, session, or Store identifiers.

Portable record kinds are exactly `message`, `fact`, `summary`, `episode`,
`pinned_context`, `document`, `entity`, and `edge`. Provider-native detail may
remain in bounded metadata. LangGraph checkpoints are execution state and are
not memory records; Letta blocks map to `pinned_context`; only OpenAI Agents
session items whose official item type is `message` map to `message`; tool,
reasoning, and compaction items are excluded. OpenAI session messages are
ranked newest first because `Session.getItems` returns the recent window in
chronological order. Graph relationships map to `edge`.

The engine enforces at most 32 configured sources, eight concurrently started
lookups, 100 results per source, 500 aggregate results, and a 60-second timeout.
Defaults are smaller. Caller abort rejects the aggregate. Provider timeout,
unavailability, unsupported modes/filters, malformed results, and other errors
are isolated into per-source outcomes; the aggregate is `partial` or `failed`.

## Deduplication and ranking

Records are grouped only when both kind and NFKC/whitespace-normalized text are
exactly equal. Every source ID, original record ID, timestamp, metadata,
provider-local score/rank, and provenance stays in `matches`. Similar text is
not semantically merged, and contradictions remain distinct.

Groups are ordered with deterministic reciprocal-rank fusion (`k = 60`) over
each source's ordinal result position. The tie break is normalized-content
codepoint order. Raw provider scores are retained with
`semantics: "source_local"` but never calibrated, added, or compared across
providers.

## Adapter boundary

| Provider | Injected read surface | Portable kinds | Abort passed through |
| --- | --- | --- | --- |
| Mem0 | `client.search(query, { filters, topK })` | `fact` | No |
| Zep | `client.graph.search({ userId/graphId, query, scope, limit }, { abortSignal })` | `edge`, `entity`, or `episode` | Yes |
| Graphiti | caller-defined `transport.search(...)` | `fact`, `episode`, `entity`, `edge` | No by default; caller opt-in |
| LangGraph | long-term `BaseStore.search(namespace, options)` | `document`, `summary`, `pinned_context` | No |
| Letta | block retrieval and agent message listing | `pinned_context`, `message` | Yes |
| OpenAI Agents | `Session.getItems(limit)` | `message` | No |

Adapters advertise only modes they actually implement: Mem0 `hybrid`, Zep
`graph`, LangGraph `semantic`, and Letta/OpenAI Agents `recent`. Graphiti is an
injected transport, so its factory defaults conservatively to `graph`; callers
must set a non-empty, unique `retrievalModes` list to advertise `hybrid` or
`semantic`. The adapter passes the selected declared mode to the transport. A
requested mode outside those declarations produces an explicit per-source
`unsupported` result and never reaches the transport.

Mem0 namespace mappers must return flat positive exact equality constraints
using the current camelCase keys `userId`, `agentId`, `appId`, or `runId`.
Snake-case keys, logical predicates, negation, `ne`, and wildcard mappings are
rejected before a provider call, so a mapping cannot appear scoped while
broadening the read. Graphiti transports receive an abort signal, but the
adapter reports abort support only when the caller sets `supportsAbort: true`.

Adapters instantiate nothing and read no environment variable. The caller owns
SDK construction, credentials, endpoint selection, retries, and provider
authorization. Version 0.3.0 implements no memory write, sync, migration,
mirror, cutover, conflict resolution, or hosted `/v1/memory` client.

## CLI planning

```sh
praxa memory source add mem0 --mode federated --dry-run
praxa memory source add mem0 --mode federated
praxa memory sync plan --dry-run
```

The first command previews local `.praxa/memory.json`; the second writes only
provider/mode/read-only metadata using an exclusive project-local lock and
atomic rename, so concurrent source additions do not overwrite one another;
the third returns an empty, non-executable plan. No provider connection or
external effect is claimed.
