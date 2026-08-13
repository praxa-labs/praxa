# `@praxa/sdk`

Credential-free TypeScript SDK for the Praxa agentic harness and versioned
Integration Gateway. Build governed AI agent workflows that create durable
missions, stream mission events, discover capabilities, query scoped agent
memory, and inspect skills, traces, goals, and world-model certificates.

The SDK accepts a short-lived delegated OAuth access-token provider at runtime.
It contains no provider credential, provider SDK dependency, default network
client, policy implementation, execution authority, or embedded secret.

## Install

```sh
npm install @praxa/sdk
```

Node.js 20 or newer is supported. The package is ESM and includes TypeScript
declarations.

## Create a client

```ts
import { PraxaClient } from "@praxa/sdk";

const client = new PraxaClient({
  baseUrl: process.env.PRAXA_BASE_URL!,
  accessToken: async () => acquireShortLivedPraxaToken(),
});
```

Pass the gateway origin, not a path. HTTPS is mandatory and URLs containing
usernames or passwords are rejected.

## Submit an intent

```ts
const submission = await client.submitIntent(
  "Prepare the weekly review",
  crypto.randomUUID(),
);
console.log(submission.submissionId, submission.disposition);
```

The server records the intent as `pending_compilation` for deterministic GoalSpec and
PlanIR compilation. Submission does not start an action and is not a provider
outcome. Advanced integrations that already own a canonical, owner-bound
GoalSpec can use `createMission` directly.

Every mutating call requires a stable idempotency key. The SDK retries safe
reads and keyed mutations only; an unkeyed mutation is never replayed. Once a
compiled mission has a run ID, `missionEvents` accepts `lastEventId` for bounded
resume.

## Public API

- `submitIntent`, `createMission`, `getMission`, `signalMission`, and
  `cancelMission`
- `missionEvents` for resumable server-sent events
- `searchCapabilities` and `queryMemory`
- `getSkill`, `getTrace`, `listGoals`, and `listWorldModelCertificates`
- `getReferenceCoverage`

## Agent-framework tools

`createPraxaAgentTools(client)` exposes the governed surface as dependency-free
tool definitions with JSON Schema 2020-12 inputs and bound execute functions.
The same package exports OpenAI function declarations as
`PRAXA_OPENAI_FUNCTION_TOOLS`.

```ts
import { createPraxaAgentTools, PraxaClient } from "@praxa/sdk";

const client = new PraxaClient({
  baseUrl: process.env.PRAXA_BASE_URL!,
  accessToken: () => process.env.PRAXA_ACCESS_TOKEN!,
});
const tools = createPraxaAgentTools(client);
const intentTool = tools.find((tool) => tool.name === "aura_submit_intent")!;
```

Inputs are checked for exact keys, bounded JSON, finite numbers, resource
budgets, and idempotency keys before the SDK transmits a request. Framework
wrappers do not gain provider credentials or bypass server policy.

Accepted work is not proof of a provider effect. The hosted harness keeps
authorization, credential isolation, action execution, and independent
verification server-side.

The `Aura*` exports and `x-aura-*` headers are stable wire-compatibility names.
New application code should use the `Praxa*` exports.

## Memory federation

Import the standalone, dependency-free surface from `@praxa/sdk/memory`:

```ts
import {
  MemoryFederation,
  createLangGraphMemorySource,
} from "@praxa/sdk/memory";

const federation = new MemoryFederation({
  sources: [createLangGraphMemorySource({
    store,
    mapNamespace: ({ tenantId, subjectId }) => [tenantId, subjectId, "memory"],
  })],
  maxConcurrency: 4,
  defaultTimeoutMs: 5_000,
});

const result = await federation.recall({
  query: "preferred editor",
  namespace: { tenantId: "acme", subjectId: "person-1" },
  limit: 10,
});
```

Factories are `createMem0MemorySource`, `createZepMemorySource`,
`createGraphitiMemorySource`, `createLangGraphMemorySource`,
`createLettaMemorySource`, and `createOpenAIAgentsSessionSource`. Each receives
a caller-owned client or transport and an explicit namespace mapper. LangGraph
checkpoints are intentionally excluded; only long-term Store items adapt.
Each adapter advertises only the retrieval mode it sends to, or can truthfully
derive from, that provider. OpenAI Agents session adaptation keeps official
message items only and ranks the recent chronological window newest first.
Graphiti defaults to the conservative `graph` mode; declare `retrievalModes`
explicitly when an injected transport also implements `hybrid` or `semantic`.

The engine groups only exact `kind + NFKC/whitespace-normalized text` matches,
retains every grouped source match, keeps contradictory text separate, and
orders groups with deterministic reciprocal-rank fusion over source ordinal
ranks. Provider scores stay source-local and are never compared. See the
repository's `docs/MEMORY-FEDERATION.md` for limits and supported read shapes.

`MemoryRecordEnvelopeV1`, `createMemoryRecordEnvelopeV1`,
`parseMemoryRecordEnvelopeV1`, and `isMemoryRecordEnvelopeV1` provide the
dependency-free portable interchange contract. The strict validator preserves
source identity, original timestamps, and provenance while applying the same
empty metadata/evidence/origin-chain defaults as the hosted schema. It performs
no network call and uses the hosted calendar-valid RFC 3339 timestamp grammar.

`src/generated-contracts.ts` is deterministically generated from the canonical
OpenAPI document. In the private harness, run `npm run
generate:integration-sdk` after an intentional contract change and `npm run
validate:integration-sdk` in every validation lane.

Repository: [praxa-labs/praxa](https://github.com/praxa-labs/praxa)
