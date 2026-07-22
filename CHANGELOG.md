# Changelog

All notable changes to the Praxa open-source packages are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the packages use [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
