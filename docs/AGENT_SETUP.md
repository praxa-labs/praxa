# Agent setup

Praxa can be added to an existing repository without copying secrets into
source control:

```sh
npx @praxa/cli@0.2.0 init
```

The default target set is Codex, Claude Code, Cursor, VS Code, and an
environment template. The installer plans every file before writing, preserves
unrelated MCP servers, writes atomically, and refuses a conflicting `praxa`
entry unless `--force` is supplied.

## Preview or select clients

```sh
npx @praxa/cli@0.2.0 init --dry-run --json
npx @praxa/cli@0.2.0 init --target codex --target cursor
npx @praxa/cli@0.2.0 init --project-dir ./my-agent
```

Generated files:

| Target | Project file | Credential reference |
| --- | --- | --- |
| Codex | `.codex/config.toml` | `PRAXA_ACCESS_TOKEN` environment variable |
| Claude Code | `.mcp.json` | `${PRAXA_ACCESS_TOKEN}` interpolation |
| Cursor | `.cursor/mcp.json` | `${env:PRAXA_ACCESS_TOKEN}` interpolation |
| VS Code | `.vscode/mcp.json` | secure `promptString` input |
| Environment | `.env.praxa.example` and `.gitignore` | blank placeholder; `.env.praxa` is ignored |

The installer also writes `.praxa/config.json`, which lets later `praxa`
commands reuse the gateway origin, and `.praxa/SETUP.md`, which gives the agent
and operator exact next steps.

## Authentication modes

Environment mode is the default:

```sh
PRAXA_ACCESS_TOKEN="$(your-secret-provider read praxa-token)" praxa doctor
```

Use a password manager, process-scoped secret injection, or CI secret store.
Do not put the access token in `.env.praxa.example`; never pass a provider API
key to Praxa clients.

If the gateway's authorization server and client registration are live, allow
the selected MCP client to perform its native browser OAuth flow:

```sh
npx @praxa/cli@0.2.0 init --auth oauth
```

OAuth mode omits manual authorization headers. The client then discovers the
gateway's RFC 9728 protected-resource metadata and retains tokens in its own
credential store.

## Self-hosted gateway

Pass an exact HTTPS origin; paths, query strings, fragments, and embedded
credentials are rejected:

```sh
npx @praxa/cli@0.2.0 init --base-url https://agents.example.com
```

Run `praxa init --dry-run` first in repositories with existing client
configuration. `--force` replaces only the conflicting Praxa entry or
Praxa-managed file, not unrelated configuration.
