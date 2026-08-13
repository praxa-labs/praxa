# Changelog

All notable changes to the Praxa open-source packages are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the packages use [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2026-08-12

### Added

- Dependency-free `@praxa/sdk/memory` contracts and a bounded, read-only
  federation engine with per-source outcomes, timeout and abort handling,
  exact normalized-content grouping, retained source provenance, and
  deterministic ordinal reciprocal-rank fusion.
- Structural read adapters for Mem0, Zep, injected Graphiti transports,
  LangGraph long-term `BaseStore`, Letta pinned context and message history,
  and OpenAI Agents `Session.getItems`.
- A dependency-free `MemoryRecordEnvelopeV1` interchange type plus strict
  builder/validator aligned with the hosted `/v1/memory` record envelope.
- Local CLI memory-source configuration and non-executable sync planning with
  dry-run support, serialized atomic config updates, and explicit refusal of
  unimplemented mirror, cutover, and sync execution operations.
- Tarball-only clean-install coverage for all public entrypoints and both CLI
  binary names.

### Changed

- All three public packages now share version `0.3.0`; the existing OpenAPI
  8.1 routes, Aura wire names, and 12 MCP tool contracts remain unchanged.
- Release publication uses the exact checksummed GitHub Release tarballs and
  verifies their SHA-512 integrity against npm both before reuse and after a
  new publication.
- GitHub release events now fail before packing or publishing unless the
  release tag is exactly `vX.Y.Z` for the root package version; explicit manual
  workflow dispatch remains available.

### Security

- Federation validates source declarations, namespaces, JSON bounds,
  provenance origins, URLs and identifiers, calendar-valid timestamps, record
  sizes, source/result counts, concurrency, and timeouts at runtime, including
  for JavaScript consumers.
- Provider adapters reject broad Mem0 namespace mappings, advertise only
  implemented retrieval modes, pass supported abort signals through, preserve
  official timestamps, and keep non-message OpenAI session items out of recall.
- Mem0 namespace constraints use the official camelCase entity keys, partial
  provenance is rejected, source URLs follow hosted trimming semantics, and
  Graphiti abort support is opt-in rather than assumed.
- Adapters own no provider credential, create no default network client, and
  expose no write, sync, migration, mirror, or cutover operation.

## [0.2.0] - 2026-07-22

### Added

- `praxa init`, a credential-free project installer for Codex, Claude Code,
  Cursor, VS Code, and environment-based integrations with dry-run, selective
  targets, conflict protection, and agent-readable next steps.
- Dependency-free governed agent-tool definitions, executable SDK tool
  adapters, and OpenAI function declarations with fail-closed runtime checks.
- A natural-language `submitIntent` API, SDK method, CLI command, and MCP tool
  that records `pending_compilation` without starting an action.
- Framework recipes for Vercel AI SDK, OpenAI Responses/Agents, LangChain, and
  direct MCP clients.
- RFC 9728 protected-resource metadata for MCP OAuth discovery.

### Changed

- MCP now negotiates the current 2025-11-25 protocol while retaining
  2025-03-26 compatibility.
- Present browser origins are validated against the allowlist while native MCP
  clients that do not send `Origin` remain interoperable.

### Security

- Generated setup files contain endpoint and secret-reference metadata only;
  the installer refuses symlinks, non-regular files, unknown flags, unsafe
  origins, and conflicting managed entries unless replacement is explicit.

## [0.1.0] - 2026-07-21

### Added

- `@praxa/sdk`, a typed HTTP and server-sent event client for governed missions,
  capability discovery, purpose-scoped memory, skills, traces, goals, and
  world-model certificates.
- `@praxa/cli`, a no-credential command-line adapter for gateway diagnostics and
  durable mission operations.
- `@praxa/mcp-contracts`, protocol-only MCP 2025-03-26 tool metadata, OAuth
  scopes, idempotency rules, route mappings, and JSON-RPC types.
- A reviewed, allowlisted public-source export with deterministic SHA-256 file
  manifest, boundary checks, package-content checks, examples, and security
  documentation.
- npm publishing automation with provenance support and checksummed GitHub
  Release assets.

[0.2.0]: https://github.com/praxa-labs/praxa/releases/tag/v0.2.0
[0.1.0]: https://github.com/praxa-labs/praxa/releases/tag/v0.1.0
[0.3.0]: https://github.com/praxa-labs/praxa/releases/tag/v0.3.0
