# `@praxa/cli`

Thin command-line adapter over `@praxa/sdk`. The CLI neither stores provider
credentials nor calls providers directly.

## Install

```sh
npm install --global @praxa/cli
```

The package is registry-ready but is not claimed as published until a separate
npm release is completed and verified. From a source checkout, run `npm ci`,
`npm run build`, and then `node packages/cli/bin/praxa.mjs version`.

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

`praxa version` is a no-network installation smoke. It prints the exact OpenAPI
version, wire contract version, and OpenAPI source hash. `praxa doctor` performs
an authenticated read-only gateway check.
