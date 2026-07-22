# `@praxa/sdk`

Credential-free TypeScript SDK for the Praxa agentic harness and versioned
Integration Gateway. Build governed AI agent workflows that create durable
missions, stream mission events, discover capabilities, query scoped agent
memory, and inspect skills, traces, goals, and world-model certificates.

The SDK accepts a short-lived delegated OAuth access-token provider at runtime.
It contains no provider adapter, provider credential, policy implementation,
execution authority, or embedded secret.

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

`src/generated-contracts.ts` is deterministically generated from the canonical
OpenAPI document. In the private harness, run `npm run
generate:integration-sdk` after an intentional contract change and `npm run
validate:integration-sdk` in every validation lane.

Repository: [praxa-labs/praxa](https://github.com/praxa-labs/praxa)
