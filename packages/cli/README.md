# `@praxa/cli`

Command-line interface for the Praxa agentic harness. Create, inspect, and
cancel durable AI agent missions or diagnose a hosted Integration Gateway from
shell scripts and CI without storing provider credentials.

The CLI is a thin adapter over `@praxa/sdk`; deterministic authorization,
provider execution, and verification remain server-side.

## Install

```sh
npm install --global @praxa/cli
praxa version
```

Node.js 20 or newer is supported. `praxa version` is a no-network installation
check that prints the exact OpenAPI version, wire-contract version, and OpenAPI
source hash.

## Configure

```sh
export PRAXA_BASE_URL="https://api.example.com"
export PRAXA_ACCESS_TOKEN="<short-lived delegated OAuth token>"
```

`--base-url` overrides `PRAXA_BASE_URL`. The older `AURA_BASE_URL` and
`AURA_ACCESS_TOKEN` variables remain compatibility fallbacks. Never place a
provider API key in either variable.

## Commands

```text
praxa version
praxa doctor
praxa mission get --run-id <uuid>
praxa mission create --input mission.json --idempotency-key <uuid>
praxa mission cancel --run-id <uuid> --reason <text> --idempotency-key <uuid>
```

`praxa doctor` performs an authenticated, read-only gateway check. Mission
mutations require stable idempotency keys so a caller can safely retry without
silently duplicating consequential work.

Repository: [praxa-labs/praxa](https://github.com/praxa-labs/praxa)
