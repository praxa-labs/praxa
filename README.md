# Praxa SDK

[![npm: @praxa/sdk](https://img.shields.io/npm/v/@praxa/sdk?label=%40praxa%2Fsdk)](https://www.npmjs.com/package/@praxa/sdk)
[![npm: @praxa/cli](https://img.shields.io/npm/v/@praxa/cli?label=%40praxa%2Fcli)](https://www.npmjs.com/package/@praxa/cli)
[![npm: @praxa/mcp-contracts](https://img.shields.io/npm/v/@praxa/mcp-contracts?label=%40praxa%2Fmcp-contracts)](https://www.npmjs.com/package/@praxa/mcp-contracts)
[![CI](https://github.com/praxa-labs/praxa/actions/workflows/ci.yml/badge.svg)](https://github.com/praxa-labs/praxa/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](LICENSE)

Praxa is an open-source TypeScript SDK, CLI, and Model Context Protocol (MCP)
contract library for building governed AI agents on the Praxa agentic harness.
Applications can submit durable agent missions, discover capabilities, query
purpose-scoped memory, stream mission events, inspect causal traces, and
request human-governed actions without embedding provider credentials.

The packages provide the public integration layer for AI agent orchestration.
Deterministic authorization, tool execution, provider adapters, credential
isolation, independent verification, and durable recovery remain behind the
hosted Praxa Integration Gateway.

## Packages

| Package | Install | Capability |
| --- | --- | --- |
| [`@praxa/sdk`](https://www.npmjs.com/package/@praxa/sdk) | `npm install @praxa/sdk` | Typed HTTP and SSE client for missions, memory, capabilities, skills, traces, and world-model certificates |
| [`@praxa/cli`](https://www.npmjs.com/package/@praxa/cli) | `npm install --global @praxa/cli` | Command-line interface for gateway diagnostics and durable mission operations |
| [`@praxa/mcp-contracts`](https://www.npmjs.com/package/@praxa/mcp-contracts) | `npm install @praxa/mcp-contracts` | MCP 2025-03-26 tool metadata, OAuth scopes, JSON-RPC types, and governed route mappings |

## Agentic harness capabilities

- Durable AI agent missions with explicit resource budgets, cancellation, and
  resumable server-sent event streams.
- Capability discovery across governed native, MCP, and agent-to-agent tool
  surfaces.
- Purpose- and compartment-scoped agent memory queries.
- Human approval, consent, scope, budget, target, and revocation enforcement at
  a server-side policy chokepoint.
- Idempotent mutations, bounded retries, causal traces, and explicit uncertain
  outcomes for reliable agent workflows.
- Versioned skill and world-model certificate inspection without granting
  execution authority to models or metadata.
- OAuth-scoped integration for TypeScript, Node.js, browser applications,
  command-line automation, and remote MCP clients.
- Independent provider-effect verification and auditable receipts in the
  private execution plane.

## Quick start

Requirements:

- Node.js 20 or newer
- A Praxa Integration Gateway HTTPS origin
- A short-lived delegated Praxa OAuth token

Install the SDK:

```sh
npm install @praxa/sdk
```

Create and observe a governed agent mission:

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

for await (const event of praxa.missionEvents(mission.runId)) {
  console.log(event.id, event.event, event.data);
}
```

Every mutation uses a caller-supplied idempotency key. Accepted work is not
presented as a verified external effect; applications can retain uncertainty
until the server exposes independent verification evidence.

See the [TypeScript example](examples/typescript/mission.ts), [authentication
guide](docs/AUTHENTICATION.md), [architecture guide](docs/ARCHITECTURE.md), and
[OpenAPI description](openapi/praxa-api.yaml).

## CLI

```sh
npm install --global @praxa/cli
praxa version

export PRAXA_BASE_URL="https://api.example.com"
export PRAXA_ACCESS_TOKEN="<short-lived delegated OAuth token>"
praxa doctor
praxa mission create --input mission.json --idempotency-key "$(uuidgen)"
```

`praxa version` is a no-network installation check. `praxa doctor` performs an
authenticated, read-only gateway check. Provider API keys must never be placed
in either CLI environment variable.

## MCP integrations

`@praxa/mcp-contracts` describes the governed MCP tool surface without
implementing an action executor:

```ts
import {
  MCP_PROTOCOL_VERSION,
  PRAXA_MCP_TOOLS,
  praxaMcpTool,
} from "@praxa/mcp-contracts";

console.log(MCP_PROTOCOL_VERSION);
console.log(PRAXA_MCP_TOOLS.map((tool) => tool.name));
console.log(praxaMcpTool("aura_create_mission")?.requiredScope);
```

Connect a compatible MCP 2025-03-26 Streamable HTTP client to the hosted
`/mcp` endpoint. Tool descriptions contribute no authority; the gateway still
checks delegated OAuth scope and deterministic policy for every request.

## Architecture and security boundary

```text
TypeScript SDK, CLI, or MCP client
  -> Praxa Integration Gateway (OAuth, tenant, scope, rate, idempotency)
  -> deterministic policy and exact authority
  -> private broker and provider adapter
  -> independent verifier and auditable receipt
```

The open-source packages contain no provider credentials, policy internals,
broker implementation, provider adapters, or verifier credentials. Models and
clients propose; deterministic server policy authorizes; the private broker
executes; independent evidence verifies.

Read [Security](docs/SECURITY.md) before integrating consequential actions.
Report vulnerabilities through the repository's [security policy](SECURITY.md),
not a public issue.

## Development

```sh
git clone https://github.com/praxa-labs/praxa.git
cd praxa
npm ci
npm run verify
```

`npm run verify` checks the public/private boundary, builds every package, runs
the public API suite, and inspects the exact npm tarball file lists. See
[Releasing](docs/RELEASING.md) for provenance, clean-install, and GitHub Release
procedures.

## License

Apache License 2.0. See [LICENSE](LICENSE).

Keywords: agentic harness, AI agent SDK, agent orchestration, durable agents,
governed tool execution, Model Context Protocol, MCP, agent memory, capability
discovery, human-in-the-loop, OAuth, SSE, idempotency, audit traces, TypeScript.
