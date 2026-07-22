# `@praxa/cli`

Command-line interface and project installer for the Praxa agentic harness.
Configure existing AI-agent clients, create or inspect durable missions, and
diagnose an Integration Gateway without storing provider credentials.

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

## One-command agent setup

From an existing project:

```sh
npx @praxa/cli@0.2.0 init
```

The default creates project-scoped configuration for Codex, Claude Code,
Cursor, VS Code, and a local environment template. It merges unrelated MCP
servers, refuses conflicting Praxa entries unless `--force` is explicit,
supports `--dry-run`, and never writes an access token or provider key.

```sh
praxa init --target codex --target cursor --dry-run
praxa init --base-url https://your-gateway.example --auth oauth
```

Generated `.praxa/SETUP.md` gives the agent and operator the remaining setup
steps. Environment-token mode is the default; use `--auth oauth` only when the
selected gateway has a functioning authorization server.

## Manual configuration

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
praxa init [--target <client>] [--auth environment|oauth] [--dry-run]
praxa doctor
praxa mission submit --intent <text> --idempotency-key <key>
praxa mission get --run-id <uuid>
praxa mission create --input canonical-goal-spec.json --idempotency-key <key>
praxa mission cancel --run-id <uuid> --reason <text> --idempotency-key <key>
```

`praxa doctor` performs an authenticated, read-only gateway check. `mission
submit` records free text for deterministic compilation and performs no action.
`mission create` is the advanced canonical-GoalSpec path. Mutations require
stable idempotency keys so a caller can safely retry without silently
duplicating work.

Repository: [praxa-labs/praxa](https://github.com/praxa-labs/praxa)
