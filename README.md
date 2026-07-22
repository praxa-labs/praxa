# Praxa SDK

Praxa's open-source TypeScript SDK, CLI, MCP contracts, and public gateway API
description. These packages let an application submit and observe governed
agent missions without embedding provider credentials or importing the private
authority and execution plane.

## Packages

| Package | Purpose |
| --- | --- |
| [`@praxa/sdk`](packages/sdk/README.md) | Typed HTTP and server-sent-event client |
| [`@praxa/cli`](packages/cli/README.md) | Command-line adapter over the SDK |
| [`@praxa/mcp-contracts`](packages/mcp-contracts/README.md) | MCP 2025-03-26 tool and JSON-RPC contracts |

The packages are source-available in this repository and configured for a
future public npm release. This repository does not claim they are already
published to the npm registry.

## Requirements

- Node.js 20 or newer
- npm 10 or newer
- A Praxa Integration Gateway HTTPS origin
- A short-lived delegated OAuth token for that gateway

Provider API keys do not belong in SDK, CLI, MCP, or application configuration.

## Set up from source

```sh
git clone https://github.com/praxa-labs/praxa.git
cd praxa
npm ci
npm run verify
```

Run the no-network CLI smoke:

```sh
node packages/cli/bin/praxa.mjs version
```

## Use the SDK

```ts
import { PraxaClient } from "@praxa/sdk";

const praxa = new PraxaClient({
  baseUrl: process.env.PRAXA_BASE_URL!,
  accessToken: async () => process.env.PRAXA_ACCESS_TOKEN!,
});

const mission = await praxa.createMission(
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

console.log(mission.runId, mission.status);
```

See the [TypeScript example](examples/typescript/mission.ts), [authentication
guide](docs/AUTHENTICATION.md), and [public API description](openapi/praxa-api.yaml).

## Architecture and trust boundary

Models and clients propose requests. The hosted server validates tenant,
principal, consent, purpose, scope, budget, target, idempotency, and revocation
state before private policy can authorize an action. Provider execution and
independent verification remain server-side. An accepted request is not proof
that an external effect occurred.

Read [Architecture](docs/ARCHITECTURE.md) and [Security boundary](docs/SECURITY.md)
before integrating consequential actions.

## Development

```sh
npm ci
npm run build
npm test
npm run check:packages
```

`npm run verify` runs all three. Package checks inspect the exact `npm pack
--dry-run` file lists and fail if unexpected source or local files enter a
tarball.

## License

Apache License 2.0. See [LICENSE](LICENSE).
