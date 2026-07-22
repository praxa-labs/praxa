# `@praxa/sdk`

Credential-free TypeScript client for the versioned Praxa Integration Gateway.
The SDK accepts a short-lived delegated OAuth access-token provider at runtime.
It contains no provider adapter, provider credential, execution authority, or
embedded secret.

## Install

Until the first npm registry release, install from a clone of
[`praxa-labs/praxa`](https://github.com/praxa-labs/praxa) with `npm ci` and use
the linked workspace package. After a registry release:

```sh
npm install @praxa/sdk
```

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

## Create and observe a mission

```ts
const mission = await client.createMission(
  {
    goalSpec: { task: "Prepare the weekly review" },
    resourceBudget: {
      maximumSteps: 12,
      maximumToolCalls: 8,
      maximumElapsedMs: 120_000,
      maximumParallelism: 2,
    },
  },
  crypto.randomUUID(),
);

for await (const event of client.missionEvents(mission.runId)) {
  console.log(event.id, event.event, event.data);
}
```

Every mutating call requires a stable idempotency key. The SDK retries safe
reads and keyed mutations only; an unkeyed mutation is never replayed. Mission
event streams accept `lastEventId` for bounded resume.

## Public methods

- `createMission`, `getMission`, `signalMission`, and `cancelMission`
- `missionEvents`
- `searchCapabilities` and `queryMemory`
- `getSkill`, `getTrace`, `listGoals`, and `listWorldModelCertificates`
- `getReferenceCoverage`

The `Aura*` exports and `x-aura-*` headers are stable wire-compatibility names.
New application code should use the `Praxa*` exports.

`src/generated-contracts.ts` is deterministically generated from the canonical
OpenAPI document. In the private harness, run `npm run
generate:integration-sdk` after an intentional contract change and `npm run
validate:integration-sdk` in every validation lane.
