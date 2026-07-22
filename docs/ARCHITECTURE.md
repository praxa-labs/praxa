# Architecture

Praxa is split into a public integration surface and a private authority and
execution plane.

```text
application or agent framework
  -> @praxa/sdk, @praxa/cli, or MCP client
  -> HTTPS Integration Gateway
  -> OAuth tenant, principal, scope, purpose, consent, and revocation checks
  -> deterministic policy and budget admission
  -> private broker and provider adapter
  -> external provider
  -> independent read-back verifier
  -> durable receipt and mission projection
```

The public packages format requests, preserve idempotency keys, parse bounded
event streams, and expose versioned contracts. They do not decide whether an
action is allowed and they do not possess provider credentials.

The gateway can acknowledge a request before the external effect is known. The
mission projection and verification evidence remain distinct so an unknown
outcome is not silently reported as success.

## Public contracts

- OpenAPI operations under `/v8/*`
- MCP 2025-03-26 Streamable HTTP endpoint at `/mcp`
- Delegated bearer token and exact operation scopes
- `Idempotency-Key` on mutations
- `Last-Event-ID` for bounded mission-event resume
- RFC 9457 problem details

The wire protocol retains some `aura` names for compatibility. Praxa is the
public product and package identity.
