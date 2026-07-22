# Contributing to Praxa

Thank you for improving the Praxa SDK. Keep contributions inside the public
client boundary: typed contracts, SDK behavior, CLI ergonomics, MCP metadata,
examples, tests, and documentation.

## Set up

```sh
git clone https://github.com/praxa-labs/praxa.git
cd praxa
npm ci
npm run verify
```

## Pull requests

1. Open an issue for a breaking wire or package-contract proposal.
2. Add tests for behavioral changes.
3. Keep OAuth tokens, provider credentials, customer data, and production
   receipts out of commits, fixtures, issues, and logs.
4. Run `npm run verify` and include the result in the pull request.
5. Explain compatibility, security-boundary, and migration effects.

Public package exports, OpenAPI operations, MCP tool names, headers, and event
names are versioned contracts. Prefer additive changes. A breaking wire change
requires a new contract version and coordinated private-server migration.

By submitting a contribution, you agree that it is licensed under Apache-2.0.
